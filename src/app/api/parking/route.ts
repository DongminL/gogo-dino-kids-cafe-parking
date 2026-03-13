import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer-core";                                     
import chromium from "@sparticuz/chromium-min";
import { calculateDiscountCount } from "@/lib/parking-utils";

// 싱글톤: global에 저장해야 Next.js HMR 모듈 재로드 시에도 유지됨
declare global {
  var _parkingBrowser: Browser | null;
  var _parkingPage: Page | null;
}

global._parkingBrowser = global._parkingBrowser ?? null;
global._parkingPage = global._parkingPage ?? null;

interface CarData {
  platePrefix: string;
  plateNumber: string;
  imageUrl: string;
  inDateTime: string;
}

export async function GET(request: NextRequest) {
  const carNo = request.nextUrl.searchParams.get("carNo") ?? "";

  try {
    const page = await getParkingPage();

    // 차량 번호 조회 (세션 만료 시 재로그인 후 재이동)
    const targetUrl = process.env.PARKING_CAR_URL! + `?carNo=${carNo}`;
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    const relogged = await ensureLogIn(page);
    if (relogged) {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    }

    const baseUrl: string = process.env.PARKING_BASE_URL!;

    await page.waitForSelector("#carListTable > tbody > tr[data-carno], #nonedata-row");

    const hasNoneData = (await page.$("#nonedata-row")) !== null;
    if (hasNoneData) {
      return NextResponse.json({ cars: [] });
    }

    const cars: CarData[] = await page.$$eval(
      "#carListTable > tbody > tr",
      (rows, baseUrl) =>
        rows.map((row) => {
          const fileUrl = row.getAttribute("data-fileurl") ?? "";
          const filePath = row.getAttribute("data-filepath") ?? "";
          const carNo = row.getAttribute("data-carno") ?? "";
          const carNoNo = row.getAttribute("data-carnono") ?? "";
          const inDateTime = new Date(
            (row.getAttribute("data-indtm") ?? "").replace(" ", "T") + "+09:00"
          ).toISOString();

          return {
            platePrefix: carNo.slice(0, carNo.length - carNoNo.length),
            plateNumber: carNoNo,
            imageUrl: `/api/image?url=${encodeURIComponent(baseUrl + fileUrl + filePath)}`,
            inDateTime: inDateTime,
          };
        }),
        baseUrl
    );

    return NextResponse.json({ cars });
  } catch (error) {
    await closeBrowser();
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { carNo, inDateTime, ticketType } = await request.json();

  try {
    const page = await getParkingPage();

    const result = await applyParkingDiscount(page, carNo, inDateTime, ticketType);

    return NextResponse.json({ success: result });
  } catch (error) {
    await closeBrowser();
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

async function getLaunchOptions() {
  if (process.env.VERCEL) {
    return {
      args: [
        ...chromium.args, 
        "--disable-features=HttpsFirstBalancedModeAutoEnable"
      ],
      executablePath: await chromium.executablePath(
        "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
      ),
      headless: true as const,
    };
  }
  return {
    args: [
      "--no-sandbox", 
      "--disable-setuid-sandbox", 
      "--disable-features=HttpsFirstBalancedModeAutoEnable"
    ],
    executablePath: process.env.CHROME_PATH!,
    headless: true as const,
  };
}

async function getParkingPage(): Promise<Page> {
  // 브라우저가 없거나 연결이 끊긴 경우 새로 실행
  if (!global._parkingBrowser || !global._parkingBrowser.connected) {
    global._parkingBrowser = await puppeteer.launch(await getLaunchOptions());
    global._parkingPage = null;
  }

  // 페이지가 없거나 닫힌 경우 새로 열고 로그인
  if (!global._parkingPage || global._parkingPage.isClosed()) {
    global._parkingPage = await global._parkingBrowser.newPage();
    await global._parkingPage.goto(process.env.PARKING_CAR_URL!, { waitUntil: "domcontentloaded" });
    await ensureLogIn(global._parkingPage);
  }

  return global._parkingPage;
}

// 로그인 페이지일 때, 로그인 함 (로그인한 여부 반환)
async function ensureLogIn(page: Page): Promise<boolean> {
  const needsLogin = (await page.$("#loginId")) !== null;

  if (needsLogin) {
    await page.type("#loginId", process.env.PARKING_ID!);
    await page.type("#loginPw", process.env.PARKING_PW!);
    await page.click("#loginBtn");
    await page.waitForSelector("#carNo");
    console.log("login success");

    return true;
  }

  return false;
}

/** 
 * @returns true: 정산 완료, false: 카운터에서 체크 필요
 */
async function applyParkingDiscount(
  page: Page,
  carNo: string,
  inDateTime: string,
  ticketType: string
): Promise<boolean> {
  // 1. 차량 목록에서 해당 차량 클릭
  await page.click(`#carListTable > tbody > tr[data-carno="${carNo}"]`);

  // 2. 4시간권이 이미 적용됐는지 확인
  // 로딩 기다리기
  await page.waitForFunction(() => {
    const td = document.querySelector("#dcticListTable > tbody > tr > td:nth-child(1)")
    const text = td?.textContent?.trim() ?? "";
    return text.length > 0 && !text.includes("조회중");
  });
  const alreadyHas4h: boolean = await page.$eval(
    "#dcticListTable > tbody > tr > td:nth-child(1)",
    el => el.textContent?.includes("4시간") === true
  );

  // 카운터에서 따로 확인하도록, 여기선 정산 중단
  if (alreadyHas4h && ticketType === "unlimited") {
    console.log(
      `주차 정산 완료 (차량번호: ${carNo}, 입장권: ${ticketType}) (카운터에서 체크 필요)\n` +
      `4시간권: 0개, 1시간권: 0개, 30분권: 0개`
    );
    return false;
  }
  

  //3. 부여할 30분권의 개수 계산
  let count: number = calculateDiscountCount(inDateTime, ticketType, alreadyHas4h);

  // 정산이 필요 없는 경우
  if (count == 0) {
    return true;
  }

  // 4. 계산된 개수에 해당하는 버튼 클릭으로 할인권 부여
  const fourHourBtn =  await page.$(`input[data-dc_time="240"] + ul .dc-item-btn-div button:nth-child(1)`);
  const oneHourBtn =  await page.$(`input[data-dc_time="60"] + ul .dc-item-btn-div button:nth-child(1)`);
  const thirtyMinuteBtn =  await page.$(`input[data-dc_time="30"] + ul .dc-item-btn-div button:nth-child(1)`);

  // 첫 주차 등록 손님은 기본으로 4시간권 부여
  if (!alreadyHas4h) {
    await fourHourBtn?.click();
    count -= 8;
  }

  // 종일권인데 4시간 초과로 할인해야 될 경우, 4시간 제외한 추가 할인은 카운터에서 직접 체크
  if (ticketType === "unlimited" && count > 0) {
    // 적용 버튼 클릭
    await page.click("#dcTicApplyBtn");
    await page.waitForSelector("div.bootbox-confirm.in button.bootbox-accept");
    await page.click("div.bootbox-confirm.in button.bootbox-accept");
    await page.waitForSelector("div.bootbox.in button.bootbox-accept");
    await page.click("div.bootbox.in button.bootbox-accept");

    console.log(
      `주차 정산 완료 (차량번호: ${carNo}, 입장권: ${ticketType}) (카운터에서 체크 필요)\n` +
      `4시간권: ${alreadyHas4h ? 0 : 1}개, 1시간권: 0개, 30분권: 0개`
    );
    return false;
  }

  // 1시간권 부여
  const oneHourCount: number = Math.floor(count / 2);
  for (let i = 0; i < oneHourCount; i++) {
    await oneHourBtn?.click();
  }

  // 30분권 부여
  const thirtyMinuteCount: number = count % 2;
  for (let i = 0; i < thirtyMinuteCount; i++) {
    await thirtyMinuteBtn?.click();
  }

  // 5. 적용 버튼 클릭 (최종)
  await page.click("#dcTicApplyBtn");
  await page.waitForSelector("div.bootbox-confirm.in button.bootbox-accept");
  await page.click("div.bootbox-confirm.in button.bootbox-accept");
  await page.waitForSelector("div.bootbox.in button.bootbox-accept");
  await page.click("div.bootbox.in button.bootbox-accept");

  console.log(
    `주차 정산 완료 (차량번호: ${carNo}, 입장권: ${ticketType})\n` +
    `4시간권: ${alreadyHas4h ? 0 : 1}개, 1시간권: ${oneHourCount}개, 30분권: ${thirtyMinuteCount}개`
  );

  return true;
}

async function closeBrowser() {
  await global._parkingPage?.close();
  global._parkingPage = null;
  await global._parkingBrowser?.close();
  global._parkingBrowser = null;
}
