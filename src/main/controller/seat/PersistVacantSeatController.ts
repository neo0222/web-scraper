import { DynamoDBStreamEvent } from "aws-lambda"
import { BatchAssignCrawlingDetail } from "../../application/crawling/detail/BatchAssignCrawlingDetail"
import { EventBridgeLambdaEvent } from "../../application/event-bridge/EventBridgeLambdaEvent"
import { BusinessError } from "../../common/BusinessError"
import { Nullable } from "../../common/Nullable"
import { SystemError } from "../../common/SystemError"
import { CrawlingResult } from "../../domain/model/crawling-result/CrawlingResult"
import { Seat } from "../../domain/model/seat/Seat"
import { Session } from "../../domain/model/session/Session"
import { ICrawlingResultRepository } from "../../domain/repository/crawling-result/ICrawlingResultRepository"
import { ISeatRepository } from "../../domain/repository/seat/ISeatRepository"
import { MatineeOrSoiree } from "../../domain/value/performance/MatineeOrSoiree"
import { PerformanceCode } from "../../domain/value/performance/PerformanceCode"
import { PerformanceDate } from "../../domain/value/performance/PerformanceDate"
import { PerformanceDatetimeInfoList } from "../../domain/value/performance/PerformanceDatetimeInfoList"
import { PerformanceId } from "../../domain/value/performance/PerformanceId"
import { PerformanceName } from "../../domain/value/performance/PerformanceName"
import { DetectionDatetime } from "../../domain/value/seat/DetectionDatetime"
import { VacantSeatInfoList } from "../../domain/value/seat/VacantSeatInfoList"
import { ICrawlingInvoker } from "../../gateway/ICrawlingInvoker"
import { IS3Invoker } from "../../gateway/IS3Invoker"
import { IController } from "../IController"

export class PersistVacantSeatController implements IController {

  crawlingResultRepository: ICrawlingResultRepository
  seatRepository: ISeatRepository

  constructor(
    crawlingResultRepository: ICrawlingResultRepository,
    seatRepository: ISeatRepository
  ) {
    this.crawlingResultRepository = crawlingResultRepository
    this.seatRepository = seatRepository
  }

  async execute(event: DynamoDBStreamEvent): Promise<any> {
    try {
      const promises: Promise<void>[] = []
      for (const record of event.Records) {
        if (record.eventName === 'REMOVE') continue
        promises.push((async () => {
          if (record.dynamodb?.NewImage?.performanceCode?.S === undefined) throw BusinessError.PERFORMANCE_CODE_NOT_GIVEN
          if (record.dynamodb?.NewImage?.performanceDate?.S === undefined) throw BusinessError.PERFORMANCE_DATE_NOT_GIVEN
          if (record.dynamodb?.NewImage?.matineeOrSoiree?.S === undefined) throw BusinessError.MATINEE_OR_SOIREE_NOT_GIVEN
          if (record.dynamodb?.ApproximateCreationDateTime === undefined) throw BusinessError.INVALID_DATE_FORMAT
          const unixTime: number = record.dynamodb?.ApproximateCreationDateTime
          const crawlingResult: CrawlingResult = (await this.crawlingResultRepository.findByCodeAndDateAndMatineeOrSoiree(
            PerformanceCode.create(record.dynamodb.NewImage['performanceCode'].S),
            PerformanceDate.create(record.dynamodb.NewImage['performanceDate'].S),
            record.dynamodb.NewImage['matineeOrSoiree'].S as MatineeOrSoiree
          )).orElseThrow(BusinessError.CRAWLER_RESULT_NOT_FOUND)
          // ????????????????????????????????????????????????????????????
          const alreadyVacantSeatList: Seat[] = (await this.seatRepository.findByCodeAndDateAndMatineeOrSoiree(
            PerformanceCode.create(record.dynamodb.NewImage['performanceCode'].S),
            PerformanceDate.create(record.dynamodb.NewImage['performanceDate'].S),
            record.dynamodb.NewImage['matineeOrSoiree'].S as MatineeOrSoiree
          )).get()
          const seatPromises: Promise<void>[] = []
          for (const vacantSeatInfo of crawlingResult.vacantSeatInfoList.list) {
            seatPromises.push((async () => {
              // ?????????????????????????????????????????????
              if (alreadyVacantSeatList.some(alreadyVacantSeat => {
                return vacantSeatInfo.equals(alreadyVacantSeat.seatInfo)
              })) {
                return
              }
              // ??????????????????????????????????????????????????????????????????????????????????????????????????????
              const seat: Seat = Seat.create(
                crawlingResult.performanceId,
                crawlingResult.performanceCode,
                crawlingResult.performanceName,
                crawlingResult.performanceDate,
                crawlingResult.matineeOrSoiree,
                crawlingResult.performanceStartTime,
                vacantSeatInfo,
                DetectionDatetime.fromUnixTime(unixTime)
              )
              await this.seatRepository.save(seat)
            })())
          }
          await Promise.all(seatPromises)
        })())
      }
      await Promise.all(promises)
    } catch (error) {
      console.log(error)
    }
  }

}