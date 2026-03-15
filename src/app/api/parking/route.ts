import { NextRequest, NextResponse } from "next/server";
import { parkingService } from "@/parking/parking.module";
import { CarInfo, ApplyDiscountResult } from "@/parking/dto/parking-response.dto";
import { ApplyDiscountRequest } from "@/parking/dto/parking-request.dto";
import { httpRequestsTotal, httpRequestDurationSeconds } from "@/lib/metrics";

export async function GET(request: NextRequest) {
  const start = performance.now();
  const carNo = request.nextUrl.searchParams.get("carNo") ?? "";

  try {
    const cars: CarInfo[] = await parkingService.getCars(carNo);

    const duration = (performance.now() - start) / 1000;
    httpRequestsTotal.add(1, { method: "GET", route: "/api/parking", status_code: "200" });
    httpRequestDurationSeconds.record(duration, { method: "GET", route: "/api/parking", status_code: "200" });

    return NextResponse.json({ cars });
  } catch (error) {
    await parkingService.closeBrowser();

    const duration = (performance.now() - start) / 1000;
    httpRequestsTotal.add(1, { method: "GET", route: "/api/parking", status_code: "500" });
    httpRequestDurationSeconds.record(duration, { method: "GET", route: "/api/parking", status_code: "500" });

    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const start = performance.now();
  const requestBody: ApplyDiscountRequest = await request.json();

  try {
    const result: ApplyDiscountResult = await parkingService.applyDiscount(requestBody);

    const duration = (performance.now() - start) / 1000;
    httpRequestsTotal.add(1, { method: "POST", route: "/api/parking", status_code: "200" });
    httpRequestDurationSeconds.record(duration, { method: "POST", route: "/api/parking", status_code: "200" });

    return NextResponse.json({ result });
  } catch (error) {
    await parkingService.closeBrowser();

    const duration = (performance.now() - start) / 1000;
    httpRequestsTotal.add(1, { method: "POST", route: "/api/parking", status_code: "500" });
    httpRequestDurationSeconds.record(duration, { method: "POST", route: "/api/parking", status_code: "500" });

    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
