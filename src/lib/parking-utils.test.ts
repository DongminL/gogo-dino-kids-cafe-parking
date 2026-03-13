import { calculateDiscountCount } from "./parking-utils";
import { TicketType } from "@/parking/dto/type.dto";

// 현재 시각을 고정해서 테스트 결과가 실행 시간에 따라 달라지지 않도록 함
const FIXED_NOW = new Date("2024-01-01T12:00:00");

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("2시간권 - 4시간 할인권 미적용 상태", () => {
  it("주차 30분 → 할인권 2개 (30분 * 2 = 1시간 커버)", () => {
    expect(calculateDiscountCount(minutesAgo(30), TicketType.TWO_HOURS, false)).toBe(2);
  });

  it("주차 1시간 → 할인권 3개", () => {
    expect(calculateDiscountCount(minutesAgo(60), TicketType.TWO_HOURS, false)).toBe(3);
  });

  it("주차 2시간 → 할인권 5개", () => {
    expect(calculateDiscountCount(minutesAgo(120), TicketType.TWO_HOURS, false)).toBe(5);
  });

  it("주차 4시간 → 최대치 8개로 제한됨", () => {
    expect(calculateDiscountCount(minutesAgo(240), TicketType.TWO_HOURS, false)).toBe(8);
  });

  it("주차 10시간 → 최대치 8개로 제한됨", () => {
    expect(calculateDiscountCount(minutesAgo(600), TicketType.TWO_HOURS, false)).toBe(8);
  });

  it("방금 주차 (1분) → 할인권 1개", () => {
    expect(calculateDiscountCount(minutesAgo(1), TicketType.TWO_HOURS, false)).toBe(1);
  });
});


describe("종일권 - 4시간 할인권 미적용 상태", () => {
  it("주차 1시간 → 할인권 3개", () => {
    expect(calculateDiscountCount(minutesAgo(60), TicketType.UNLIMITED, false)).toBe(3);
  });

  it("주차 4시간 → 할인권 9개", () => {
    expect(calculateDiscountCount(minutesAgo(240), TicketType.UNLIMITED, false)).toBe(9);
  });

  it("주차 6시간 → 최대치 12개로 제한됨", () => {
    expect(calculateDiscountCount(minutesAgo(360), TicketType.UNLIMITED, false)).toBe(12);
  });

  it("주차 10시간 → 최대치 12개로 제한됨", () => {
    expect(calculateDiscountCount(minutesAgo(600), TicketType.UNLIMITED, false)).toBe(12);
  });
});

describe("이미 4시간 할인권 적용된 상태", () => {
  it("주차 4시간 30분 → 잔여 30분 → 할인권 2개", () => {
    expect(calculateDiscountCount(minutesAgo(270), TicketType.TWO_HOURS, true)).toBe(2);
  });

  it("주차 4시간 45분 → 잔여 45분 → 할인권 3개", () => {
    expect(calculateDiscountCount(minutesAgo(285), TicketType.TWO_HOURS, true)).toBe(3);
  });

  it("주차 8시간 → 종일권 최대치 12개로 제한됨", () => {
    expect(calculateDiscountCount(minutesAgo(480), TicketType.UNLIMITED, true)).toBe(9);
  });

  it("주차 정확히 4시간 (잔여 0분) → 할인권 1개", () => {
    expect(calculateDiscountCount(minutesAgo(240), TicketType.TWO_HOURS, true)).toBe(1);
  });

  it("주차 3시간 (4시간보다 적은데 alreadyHas4h=true) → 음수 방지 → 0개", () => {
    expect(calculateDiscountCount(minutesAgo(180), TicketType.TWO_HOURS, true)).toBe(0);
  });
});

function minutesAgo(minutes: number): string {
  return new Date(FIXED_NOW.getTime() - minutes * 60_000).toISOString();
}