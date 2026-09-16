import { HeatmapChart, LineChart } from 'echarts/charts'
import {
  CalendarComponent,
  GridComponent,
  LegendPlainComponent,
  LegendScrollComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from 'echarts/components'
import { init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([
  LineChart,
  HeatmapChart,
  CalendarComponent,
  GridComponent,
  LegendPlainComponent,
  LegendScrollComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
  CanvasRenderer,
])

export { init }
export type { EChartsCoreOption, EChartsType } from 'echarts/core'
