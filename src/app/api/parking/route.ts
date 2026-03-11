import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer";

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
      headless: false,
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

export async function GET(request: NextRequest) {
  const carNo = request.nextUrl.searchParams.get("carNo") ?? "";

  try {
    const page = await getParkingPage();

    // 차량 번호 조회
    await page.goto(process.env.PARKING_CAR_URL + `?carNo=${carNo}`!, { waitUntil: "domcontentloaded" });

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
    //parkingPage?.close();
    global._parkingPage = null;
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
