import { TicketType } from "@/parking/dto/type.dto";

// 이용권 종류별 최대 부여 가능한 할인권 개수 (30분권 개수)
const MAX_DISCOUNT_COUNT: Record<TicketType, number> = {
  [TicketType.TWO_HOURS]: 8,     // 2시간권: 최대 8개 (4시간)
  [TicketType.UNLIMITED]: 12, // 종일권: 최대 12개 (6시간)
};

export interface DiscountResult {
  parkingMinutes: number;
  count: number;
  remainingFreeMinutes: number;
}

// 30분 주차 할인권 부여 횟수 계산
export function calculateDiscountCount(
  inDateTime: string,
  ticketType: TicketType,
  alreadyHas4h: boolean
): DiscountResult {
  const inTime: Date = new Date(inDateTime);
  const now: Date = new Date();
  const parkingMinutes: number = Math.floor((now.getTime() - inTime.getTime()) / 60_000);
  let parkingTime = parkingMinutes;

  // 4시간권이 이미 적용된 경우
  if (alreadyHas4h) {
    parkingTime -= 240;
  }

  const rawCount: number = Math.ceil((parkingTime + 25) / 30);
  const count = Math.min(Math.max(0, rawCount), MAX_DISCOUNT_COUNT[ticketType]);

  const remainingFreeMinutes = (count * 30) - parkingTime;

  return { parkingMinutes, count, remainingFreeMinutes };
}
