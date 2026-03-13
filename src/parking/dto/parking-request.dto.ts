import { TicketType } from "./type.dto";

export interface ApplyDiscountRequest {
  carNo: string;
  inDateTime: string;
  ticketType: TicketType;
}