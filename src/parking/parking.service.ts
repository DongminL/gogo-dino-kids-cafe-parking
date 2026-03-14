import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { calculateDiscountCount, DiscountResult } from "@/lib/parking-utils";
import { logParkingSettlement } from "@/lib/logger";
import { CarInfo, ApplyDiscountResult } from "@/parking/dto/parking-response.dto";
import { ApplyDiscountRequest } from "@/parking/dto/parking-request.dto";
import { TicketType } from "@/parking/dto/type.dto";

// 싱글톤: global에 저장해야 Next.js HMR 모듈 재로드 시에도 유지됨
declare global {
  var _parkingBrowser: Browser | null;
  var _parkingPage: Page | null;
}

global._parkingBrowser = global._parkingBrowser ?? null;
global._parkingPage = global._parkingPage ?? null;

export class ParkingService {
  async getCars(carNo: string): Promise<CarInfo[]> {
    const page: Page = await this.getParkingPage();

    const targetUrl: string = process.env.PARKING_CAR_URL! + `?carNo=${carNo}`;
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    const relogged: boolean = await this.ensureLogIn(page);
    if (relogged) {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    }

    const baseUrl: string = process.env.PARKING_BASE_URL!;
    await page.waitForSelector("#carListTable > tbody > tr[data-carno], #nonedata-row");

    const hasNoneData: boolean = (await page.$("#nonedata-row")) !== null;
    if (hasNoneData) {
      return [];
    }

    const cars: CarInfo[] = await page.$$eval(
      "#carListTable > tbody > tr",
      (rows, baseUrl) =>
        rows.map((row) => {
          const fileUrl: string = row.getAttribute("data-fileurl") ?? "";
          const filePath: string = row.getAttribute("data-filepath") ?? "";
          const carNo: string = row.getAttribute("data-carno") ?? "";
          const carNoNo: string = row.getAttribute("data-carnono") ?? "";
          const inDateTime: string = new Date(
            (row.getAttribute("data-indtm") ?? "").replace(" ", "T") + "+09:00"
          ).toISOString();

          return {
            platePrefix: carNo.slice(0, carNo.length - carNoNo.length),
            plateNumber: carNoNo,
            imageUrl: `/api/image?url=${encodeURIComponent(baseUrl + fileUrl + filePath)}`,
            inDateTime,
          };
        }),
      baseUrl
    );

    return cars;
  }

  async applyDiscount(
    request: ApplyDiscountRequest
  ): Promise<ApplyDiscountResult> {
    const page: Page = await this.getParkingPage();
    return this.applyParkingDiscount(page, request);
  }

  async closeBrowser(): Promise<void> {
    await global._parkingPage?.close();
    global._parkingPage = null;
    await global._parkingBrowser?.close();
    global._parkingBrowser = null;
  }

  private async getParkingPage(): Promise<Page> {
    if (!global._parkingBrowser || !global._parkingBrowser.connected) {
      global._parkingBrowser = await puppeteer.launch(await this.getLaunchOptions());
      global._parkingPage = null;
    }

    if (!global._parkingPage || global._parkingPage.isClosed()) {
      global._parkingPage = await global._parkingBrowser.newPage();
      await global._parkingPage.goto(process.env.PARKING_CAR_URL!, { waitUntil: "domcontentloaded" });
      await this.ensureLogIn(global._parkingPage);
    }

    return global._parkingPage;
  }

  private async ensureLogIn(page: Page): Promise<boolean> {
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

  private async applyParkingDiscount(
    page: Page,
    request: ApplyDiscountRequest
  ): Promise<ApplyDiscountResult> {
    // 1. 차량 목록에서 해당 차량 클릭
    await page.click(`#carListTable > tbody > tr[data-carno="${request.carNo}"]`);

    // 2. 4시간권이 이미 적용됐는지 확인
    await page.waitForFunction(() => {
      const td = document.querySelector("#dcticListTable > tbody > tr > td:nth-child(1)");
      const text: string = td?.textContent?.trim() ?? "";
      return text.length > 0 && !text.includes("조회중");
    });
    const alreadyHas4h: boolean = await page.$eval(
      "#dcticListTable > tbody > tr > td:nth-child(1)",
      (td) => td.textContent?.includes("4시간") === true
    );

    const discountResult: DiscountResult = calculateDiscountCount(request.inDateTime, request.ticketType, alreadyHas4h);
    let discountCount = discountResult.count;

    // 카운터에서 따로 확인하도록, 여기선 정산 중단
    if (alreadyHas4h && request.ticketType === TicketType.UNLIMITED) {
      await logParkingSettlement({
        ticketType: request.ticketType,
        parkingMinutes: discountResult.parkingMinutes,
        alreadyHas4h,
        fourHourApplied: false,
        oneHourCount: 0,
        thirtyMinCount: 0,
        discountGivenMinutes: 0,
        remainingFreeMinutes: discountResult.remainingFreeMinutes, 
        result: ApplyDiscountResult.NEED_COUNTER_CHECK,
      });

      return ApplyDiscountResult.NEED_COUNTER_CHECK;
    }

    // 추가 할인권이 필요 없는 경우
    if (discountCount === 0) {
      await logParkingSettlement({
        ticketType: request.ticketType,
        parkingMinutes: discountResult.parkingMinutes,
        alreadyHas4h,
        fourHourApplied: false,
        oneHourCount: 0,
        thirtyMinCount: 0,
        discountGivenMinutes: 0,
        remainingFreeMinutes: discountResult.remainingFreeMinutes,
        result: ApplyDiscountResult.SUCCESS,
      });

      return ApplyDiscountResult.SUCCESS;
    }

    // 4. 계산된 개수에 해당하는 버튼 클릭으로 할인권 부여
    const [fourHourBtn, oneHourBtn, thirtyMinuteBtn] = await Promise.all([
      page.$(`input[data-dc_time="240"] + ul .dc-item-btn-div button:nth-child(1)`),
      page.$(`input[data-dc_time="60"] + ul .dc-item-btn-div button:nth-child(1)`),
      page.$(`input[data-dc_time="30"] + ul .dc-item-btn-div button:nth-child(1)`),
    ]);

    // 첫 주차 등록 손님은 기본으로 4시간권 부여
    if (!alreadyHas4h) {
      await fourHourBtn?.click();
      discountCount -= 8;
    }

    // 종일권인데 4시간 초과로 할인해야 될 경우, 4시간 제외한 추가 할인은 카운터에서 직접 체크
    if (request.ticketType === TicketType.UNLIMITED && discountCount > 0) {
      await this.clickApplyButtons(page);

      await logParkingSettlement({
        ticketType: request.ticketType,
        parkingMinutes: discountResult.parkingMinutes,
        alreadyHas4h,
        fourHourApplied: !alreadyHas4h,
        oneHourCount: 0,
        thirtyMinCount: 0,
        discountGivenMinutes: alreadyHas4h ? 0 : 240,
        remainingFreeMinutes: discountResult.remainingFreeMinutes,
        result: ApplyDiscountResult.NEED_COUNTER_CHECK,
      });

      return ApplyDiscountResult.NEED_COUNTER_CHECK;
    }

    const oneHourCount: number = Math.floor(discountCount / 2);
    for (let i = 0; i < oneHourCount; i++) {
      await oneHourBtn?.click();
    }

    const thirtyMinuteCount: number = discountCount % 2;
    for (let i = 0; i < thirtyMinuteCount; i++) {
      await thirtyMinuteBtn?.click();
    }

    await this.clickApplyButtons(page);

    const discountGivenMinutes: number = (!alreadyHas4h ? 240 : 0) + (discountCount * 30);

    await logParkingSettlement({
      ticketType: request.ticketType,
      parkingMinutes: discountResult.parkingMinutes,
      alreadyHas4h,
      fourHourApplied: !alreadyHas4h,
      oneHourCount: Math.max(0, oneHourCount),
      thirtyMinCount: Math.max(0, thirtyMinuteCount),
      discountGivenMinutes,
      remainingFreeMinutes: discountResult.remainingFreeMinutes,
      result: ApplyDiscountResult.SUCCESS,
    });

    return ApplyDiscountResult.SUCCESS;
  }

  private async clickApplyButtons(page: Page): Promise<void> {
    await page.click("#dcTicApplyBtn");
    await page.waitForSelector("div.bootbox-confirm.in button.bootbox-accept");
    await page.click("div.bootbox-confirm.in button.bootbox-accept");
    await page.waitForSelector("div.bootbox.in button.bootbox-accept");
    await page.click("div.bootbox.in button.bootbox-accept");
  }

  private async getLaunchOptions() {
    if (process.env.VERCEL) {
      return {
        args: [
          ...chromium.args,
          "--disable-features=HttpsFirstBalancedModeAutoEnable",
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
        "--disable-features=HttpsFirstBalancedModeAutoEnable",
      ],
      executablePath: process.env.CHROME_PATH!,
      headless: true as const,
    };
  }
}
