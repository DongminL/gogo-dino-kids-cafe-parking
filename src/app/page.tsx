"use client";

import React, { useState, useEffect } from "react";
import styles from "../styles/kiosk.module.scss";
import { Car, Clock, Infinity, CheckCircle2, ChevronLeft, Home, AlertCircle } from "lucide-react";
import { CarInfo, ApplyDiscountResult } from "@/parking/dto/parking-response.dto";
import { TicketType } from "@/parking/dto/type.dto";

type Step = 0 | 1 | 2 | 3 | 4;

export default function KioskPage(): React.ReactNode {
  const [step, setStep] = useState<Step>(0);
  const [ticket, setTicket] = useState<TicketType | null>(null);
  const [plateNumber, setPlateNumber] = useState("");
  const [matchingCars, setMatchingCars] = useState<CarInfo[]>([]);
  const [selectedCar, setSelectedCar] = useState<CarInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [isNeedCounterCheck, setIsNeedCounterCheck] = useState(true);

  // 정산 완료 시 5초 후 처음으로 돌아가기
  useEffect(() => {
    if (step === 4) {
      const timer = setTimeout(() => resetKiosk(), 5000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const resetKiosk = (): void => {
    setStep(0);
    setTicket(null);
    setPlateNumber("");
    setSelectedCar(null);
    setMatchingCars([]);
    setIsSettling(false);
  };

  const handleKeypad = (num: string): void => {
    if (plateNumber.length < 4) {
      setPlateNumber((prev) => prev + num);
    }
  };

  const handleDelete = (): void => {
    setPlateNumber((prev) => prev.slice(0, -1));
  };

  const handleClear = (): void => {
    setPlateNumber("");
  };

  const handleSearchCars = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const res: Response = await fetch(`/api/parking?carNo=${plateNumber}`);

      const { cars, error }: { cars: CarInfo[], error?: string } = await res.json();

      if (error) {
        console.error("크롤링 오류:", error);
        return;
      }

      setMatchingCars(cars ?? []);
      setSelectedCar(null);
      setStep(3);
    } catch (error) {
      console.error("API 호출 오류:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettle = async (): Promise<void> => {
    if (!selectedCar || !ticket) {
      return;
    }

    setIsSettling(true);
    try {
      const carNo = selectedCar.platePrefix + selectedCar.plateNumber;

      const res: Response = await fetch("/api/parking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carNo,
          inDateTime: selectedCar.inDateTime,
          ticketType: ticket,
        }),
      });
      const { result, error }: { result: ApplyDiscountResult, error?: string } = await res.json();

      if (error) {
        console.error("정산 오류:", error);
        return;
      }

      setIsNeedCounterCheck(result === ApplyDiscountResult.SUCCESS);
      setStep(4);
    } catch (error) {
      console.error("정산 API 호출 오류:", error);
    } finally {
      setIsSettling(false);
    }
  };

  const getParkingDuration = (inDateTime: string): string => {
    const start = new Date(inDateTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();

    if (diffMs < 0) {
      return "0분";
    }

    const totalMinutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
  
    return `${minutes}분`;
  };

  return (
    <main className={styles.kioskContainer}>
      <section className={styles.kioskCard}>
        {/* Left Panel - 브랜드 로고 & 메인 안내 */}
        <aside className={styles.leftPanel}>
          <header className={styles.logoSection}>
            <img src="/logo.png" alt="고고 다이노 로고" className={styles.logo} />
            <h1>주차 정산 시스템</h1>
            <p>
              {step === 0 && "화면을 터치해서 시작해주세요!"}
              {step === 1 && "1. 이용권 선택"}
              {step === 2 && "2. 차량 번호 4자리 입력"}
              {step === 3 && "3. 차량 확인 및 정산"}
              {step === 4 && "정산이 완료되었습니다."}
            </p>
          </header>

          {/* 왼쪽 가장 아래 위치할 홈 버튼 */}
          {step > 0 && step < 4 && (
            <button className={styles.homeBtn} onClick={resetKiosk}>
              <Home size={20} /> 처음으로 돌아가기
            </button>
          )}
        </aside>

        {/* Right Panel - 실제 터치 상호작용 영역 */}
        <section className={styles.rightPanel}>
          {/* 상단: 뒤로가기 버튼만 독립적인 공간 배정 (겹침 방지) Step 3부터는 지움 */}
          <nav className={styles.rightHeader}>
            {step > 0 && step < 3 && (
              <button
                className={styles.backBtn}
                onClick={() => setStep((prev) => (prev - 1) as Step)}
              >
                <ChevronLeft size={20} /> 이전으로
              </button>
            )}
          </nav>

          <article className={styles.stepContent}>
            {/* Step 0: 시작 버튼 영역 */}
            {step === 0 && (
              <div className={styles.stepLayout}>
                <header className={styles.stepHeader}>
                  <h2 className={styles.multiline}>
                    주차 정산을 <br /> 시작하시겠습니까?
                  </h2>
                </header>

                <div className={styles.characterNoticeWrapper}>
                  <div className={styles.characterImgBox}>
                    <img
                      src="/character.png"
                      alt="고고 다이노 캐릭터"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                  <div className={styles.speechBubble}>
                    <div className={styles.speechText}>
                      앗, 잠깐! 퇴장 처리는 하셨나요?<br />
                      <strong>퇴장 처리 먼저 부탁드립니다!</strong>
                    </div>
                  </div>
                </div>

                <button className={styles.startBtn} onClick={() => setStep(1)}>
                  주차 정산 시작하기
                </button>
              </div>
            )}

            {/* Step 1: 이용권 선택 */}
            {step === 1 && (
              <div className={styles.stepLayout}>
                <header className={styles.stepHeader}>
                  <h2>이용하신 입장권 종류를 선택해 주세요</h2>
                </header>
                <div className={styles.ticketGrid}>
                  <div className={styles.ticketBtn} onClick={() => { setTicket(TicketType.TWO_HOURS); setStep(2); }}>
                    <Clock className={styles.ticketIcon} color="#009fe3" size={70} />
                    <span className={styles.ticketTitle}>2시간권</span>
                  </div>
                  <div className={styles.ticketBtn} onClick={() => { setTicket(TicketType.UNLIMITED); setStep(2); }}>
                    <Infinity className={styles.ticketIcon} color="#ef3322" size={70} />
                    <span className={styles.ticketTitle}>종일권 (무제한)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: 키패드 (차량 번호 입력) */}
            {step === 2 && (
              <div className={styles.stepLayout}>
                <header className={styles.stepHeader}>
                  <h2>차량 번호 4자리를 입력해주세요</h2>
                </header>

                <div className={styles.plateInputContainer}>
                  <div className={styles.plateTop}>
                    <div className={styles.plateInputBox}>
                      {plateNumber || <span className={styles.placeholderText}>0 0 0 0</span>}
                    </div>
                    <button
                      className={`${styles.primaryBtn} ${styles.searchBtn}`}
                      onClick={handleSearchCars}
                      disabled={plateNumber.length < 4 || isLoading}
                    >
                      {isLoading ? "조회 중..." : "차량 조회"}
                    </button>
                  </div>

                  <div className={styles.plateBottom}>
                    <div className={styles.keypad}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button key={num} className={styles.keypadBtn} onClick={() => handleKeypad(num.toString())}>
                          {num}
                        </button>
                      ))}
                      <button className={`${styles.keypadBtn} ${styles.actionBtn} ${styles.clearBtn}`} onClick={handleClear}>
                        전체 지움
                      </button>
                      <button className={styles.keypadBtn} onClick={() => handleKeypad("0")}>
                        0
                      </button>
                      <button className={`${styles.keypadBtn} ${styles.actionBtn} ${styles.backspaceBtn}`} onClick={handleDelete}>
                        지우기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: 차량 선택 및 확인 페이지 */}
            {step === 3 && (
              <div className={styles.stepLayoutStart}>
                {matchingCars.length === 0 ? (
                  <>
                    <header className={`${styles.stepHeader} ${styles.smallMargin}`}>
                      <h2>차량이 조회되지 않았습니다</h2>
                    </header>
                    <div className={styles.notFoundMessage}>
                      <AlertCircle size={70} color="#ef3322" className={styles.notFoundIcon} />
                      <p>
                        입력하신 번호(<strong>{plateNumber}</strong>)로<br />
                        등록된 차량을 찾을 수 없습니다.
                      </p>
                      <p className={styles.subText}>
                        번호를 다시 확인하고 재조회해 주세요.
                      </p>
                    </div>
                    <div className={styles.actionRow}>
                      <button
                        className={`${styles.secondaryBtn} ${styles.actionBtnPrev}`}
                        onClick={() => setStep(2)}
                      >
                        이전으로
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <header className={`${styles.stepHeader} ${styles.smallMargin}`}>
                      <h2>내 차량을 눌러 선택해주세요</h2>
                    </header>

                    <div className={styles.carListGrid}>
                      {matchingCars.map((car, idx) => (
                        <div
                          key={idx}
                          className={`${styles.carListItem} ${selectedCar === car ? styles.selected : ""}`}
                          onClick={() => setSelectedCar(car)}
                        >
                          <div className={styles.carListImage}>
                            <Car size={50} color={selectedCar === car ? "#009fe3" : "#94a3b8"} />
                          </div>
                          <div className={styles.carListInfo}>
                            <div className={styles.carListPlate}>
                              {car.platePrefix} {car.plateNumber}
                            </div>
                            <div className={styles.carListTime}>
                              <Clock size={16} className={styles.timeIcon} /> {getParkingDuration(car.inDateTime)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 선택한 차량 사진 썸네일 표시 */}
                    {selectedCar ? (
                      <figure className={styles.carPreviewBox}>
                        <div className={styles.carPreviewImg}>
                          <img src={selectedCar.imageUrl} alt="입차 차량 사진" />
                        </div>
                      </figure>
                    ) : (
                      <div className={styles.carPreviewPlaceholder}>
                        상단의 목록에서 차량을 선택하시면 사진이 표시됩니다.
                      </div>
                    )}

                    <div className={styles.actionRow}>
                      <button
                        className={`${styles.secondaryBtn} ${styles.actionBtnPrev}`}
                        onClick={() => setStep(2)}
                      >
                        이전으로
                      </button>
                      <button
                        className={`${styles.primaryBtn} ${styles.actionBtnNext}`}
                        onClick={handleSettle}
                        disabled={!selectedCar || isSettling}
                      >
                        {isSettling ? "정산 중..." : `네, 정산합니다 (${ticket === TicketType.TWO_HOURS ? "2시간권" : "종일 무제한권"})`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 4: 완료 페이지 */}
            {step === 4 && (
              <div className={styles.completeText}>
                <CheckCircle2 size={100} color="#86c043" className={styles.checkIcon} />
                <h2>정산 완료!</h2>
                <p>이용해주셔서 감사합니다.<br />안녕히 가세요! 🦖</p>

                {!isNeedCounterCheck && (
                  <div className={styles.counterNotice}>
                    <AlertCircle size={32} color="#ef3322" />
                    추가 정산은 카운터에서 요청 부탁드립니다.
                  </div>
                )}

                <button className={`${styles.secondaryBtn} ${styles.returnBtn}`} onClick={resetKiosk}>
                  처음 화면으로 돌아가기
                </button>
              </div>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}
