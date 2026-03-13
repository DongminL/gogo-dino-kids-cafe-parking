import { NextRequest, NextResponse } from "next/server";
import { parkingService } from "@/parking/parking.module";
import { CarInfo, ApplyDiscountResult } from "@/parking/dto/parking-response.dto";

export async function GET(request: NextRequest) {
  const carNo = request.nextUrl.searchParams.get("carNo") ?? "";

  try {
    const cars: CarInfo[] = await parkingService.getCars(carNo);
    return NextResponse.json({ cars });
  } catch (error) {
    await parkingService.closeBrowser();
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { carNo, inDateTime, ticketType } = await request.json();

  try {
    const result: ApplyDiscountResult = await parkingService.applyDiscount({ carNo, inDateTime, ticketType });
    return NextResponse.json({ result });
  } catch (error) {
    await parkingService.closeBrowser();
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
