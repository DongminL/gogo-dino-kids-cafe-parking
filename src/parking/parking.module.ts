import { ParkingService } from "./parking.service";

// NestJS의 Module처럼 의존성을 조립하고 싱글톤 인스턴스를 제공
const parkingService = new ParkingService();

export { parkingService };
