import { DetailType } from '../../application/event-bridge/DetailType';
import { EventBridgeLambdaEvent } from "../../application/event-bridge/EventBridgeLambdaEvent";
import { BatchAssignCrawlingDetail } from "../../application/crawling/detail/BatchAssignCrawlingDetail";
import { Session } from '../../domain/model/session/Session';
import { ICrawlingInvoker } from '../../gateway/ICrawlingInvoker';
import { IEventBridgeInvoker } from '../../gateway/IEventBridgeInvoker';
import { IController } from "../IController";
import { PerformanceCode } from '../../domain/value/performance/PerformanceCode';

export class BatchAssignCrawlingController implements IController {

  crawlingInvoker: ICrawlingInvoker
  eventBridgeInvoker: IEventBridgeInvoker

  constructor(
    crawlingInvoker: ICrawlingInvoker,
    eventBridgeInvoker: IEventBridgeInvoker
  ) {
    this.crawlingInvoker = crawlingInvoker
    this.eventBridgeInvoker = eventBridgeInvoker
  }

  async execute(event: EventBridgeLambdaEvent<BatchAssignCrawlingDetail>): Promise<any> {
    try {
      const items: {performanceCode: PerformanceCode, koenKi: string}[] = [
        {
          performanceCode: PerformanceCode.create('1011'),
          koenKi: '6',
        },
        // {
        //   performanceCode: PerformanceCode.create('1013'),
        //   koenKi: '14',
        // },
      ]
      for (const item of items) {
        const session: Session = await this.crawlingInvoker.getSession()
        const yearAndMonthList: string[] = await this.crawlingInvoker.getYearAndMonthList(session, item.performanceCode, item.koenKi)
        const promises: Promise<void>[] = []
        for (const yyyymm of yearAndMonthList) {
          promises.push(this.eventBridgeInvoker.putEvents(
            DetailType.AssignCrawling,
            new BatchAssignCrawlingDetail(
              item.performanceCode.toString(), // TODO: 複数公演に対応させる
              yyyymm,
              item.koenKi
            )
          ))
        }
        await Promise.all(promises)
      }
      
    } catch (error) {
      console.error(error)
    }
  }
}