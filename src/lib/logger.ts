import { ApplyDiscountResult } from "@/parking/dto/parking-response.dto";
import { TicketType } from "@/parking/dto/type.dto";

export interface ParkingSettlementLog {
  ticketType: TicketType;
  parkingMinutes: number;
  alreadyHas4h: boolean;
  fourHourApplied: boolean;
  oneHourCount: number;
  thirtyMinCount: number;
  discountGivenMinutes: number;
  remainingFreeMinutes: number;
  result: ApplyDiscountResult;
}

export async function logParkingSettlement(data: ParkingSettlementLog): Promise<void> {
  const logLine: string = JSON.stringify({
    event: "parking_settlement",
    ...data,
    timestamp: new Date().toISOString(),
  });

  console.log(logLine);

  const lokiUrl: string | undefined = process.env.LOKI_URL;
  if (!lokiUrl) {
    console.error("Loki URL is not defined");
    return;
  }

  const ns: string = (Date.now() * 1_000_000).toString();
  const body: string = JSON.stringify({
    streams: [
      {
        stream: {
          job: "parking",
          ticketType: data.ticketType,
          result: data.result,
        },
        values: [[ns, logLine]],
      },
    ],
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const username: string | undefined = process.env.LOKI_USERNAME;
  const password: string | undefined = process.env.LOKI_PASSWORD;
  if (username && password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  fetch(`${lokiUrl}/loki/api/v1/push`, { 
      method: "POST", 
      headers, 
      body 
    }
  ).catch((err) =>
    console.error("Loki push error:", err)
  );
}
