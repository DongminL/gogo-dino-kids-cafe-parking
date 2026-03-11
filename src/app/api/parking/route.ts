import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer";
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


async function getParkingPage(): Promise<Page> {
  // 브라우저가 없거나 연결이 끊긴 경우 새로 실행
  if (!global._parkingBrowser || !global._parkingBrowser.connected) {
    global._parkingBrowser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-features=HttpsFirstBalancedModeAutoEnable",
      ],
    });
    global._parkingPage = null;
  }

  // 페이지가 없거나 닫힌 경우 새로 열고 로그인
  if (!global._parkingPage || global._parkingPage.isClosed()) {
    global._parkingPage = await global._parkingBrowser.newPage();

    await global._parkingPage.goto(process.env.PARKING_CAR_URL!, { waitUntil: "domcontentloaded" });

    // 로그인 폼이 있으면 로그인
    const needsLogin = (await global._parkingPage.$("#loginId")) !== null;
    if (needsLogin) {
      await global._parkingPage.type("#loginId", process.env.PARKING_ID!);
      await global._parkingPage.type("#loginPw", process.env.PARKING_PW!);
      await global._parkingPage.click("#loginBtn");
      await global._parkingPage.waitForSelector("#carNo");
      console.log("login success");
    }
  }

  return global._parkingPage;
}

export async function POST(request: NextRequest) {
  const { carNo, inDateTime, ticketType } = await request.json();

  try {
    const page = await getParkingPage();

    await applyParkingDiscount(page, carNo, inDateTime, ticketType);

    return NextResponse.json({ success: true });
  } catch (error) {
    global._parkingPage = null;
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const carNo = request.nextUrl.searchParams.get("carNo") ?? "";

  try {
    const page = await getParkingPage();

    // 차량 번호 조회
    await page.goto(process.env.PARKING_CAR_URL! + `?carNo=${carNo}`, { waitUntil: "domcontentloaded" });

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
          const inDateTime = row.getAttribute("data-indtm") ?? "";

          return {
            platePrefix: carNo.slice(0, carNo.length - carNoNo.length),
            plateNumber: carNoNo,
            imageUrl: baseUrl + fileUrl + filePath,
            inDateTime: inDateTime,
          };
        }),
        baseUrl
    );

    return NextResponse.json({ cars });
  } catch (error) {
    // 에러 시 다음 요청에서 재로그인할 수 있도록 페이지 초기화
    global._parkingPage?.close();
    global._parkingPage = null;
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

async function applyParkingDiscount(
  page: Page,
  carNo: string,
  inDateTime: string,
  ticketType: string
): Promise<void> {
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

  //3. 부여할 30분권의 개수 계산
  let count: number = calculateDiscountCount(inDateTime, ticketType, alreadyHas4h);
  console.log(`할인권(30분): ${count} (차량번호: ${carNo}, 입장권: ${ticketType})`);

  // 4. 계산된 개수에 해당하는 버튼 클릭으로 할인권 부여
  const fourHourBtn =  await page.$(`input[data-dc_time="240"] + ul .dc-item-btn-div button:nth-child(1)`);
  const oneHourBtn =  await page.$(`input[data-dc_time="60"] + ul .dc-item-btn-div button:nth-child(1)`);
  const thirtyMinuteBtn =  await page.$(`input[data-dc_time="30"] + ul .dc-item-btn-div button:nth-child(1)`);

  // 기본으로 4시간권 부여
  if (!alreadyHas4h) {
    await fourHourBtn?.click();
    count = Math.max(count - 8, 0);
  }

  // 1시간권 부여
  for (let i = 0; i < Math.floor(count / 2); i++) {
    await oneHourBtn?.click();
  }

  // 30분권 부여
  for (let i = 0; i < count % 2; i++) {
    await thirtyMinuteBtn?.click();
  }

  // 5. 적용 버튼 클릭 (최종)
  await page.click("#dcTicApplyBtn");
  await page.waitForSelector("div.modal-footer");
  await page.click("div.modal-footer > button.bootbox-accept");
  await page.waitForSelector("div.modal-footer");
  await page.click("div.modal-footer > button.bootbox-accept");

  console.log(`주차 정산 완료 (차량번호: ${carNo}, 입장권: ${ticketType})`);
}
