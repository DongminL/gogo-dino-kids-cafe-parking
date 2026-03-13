export interface CarInfo {
  platePrefix: string;
  plateNumber: string;
  imageUrl: string;
  inDateTime: string;
}

export enum ApplyDiscountResult {
  SUCCESS = "success",
  NEED_COUNTER_CHECK = "needCounterCheck",
}