import { SunIcon, type FeatureModule } from '@jeeweave/ui'
import { TodayPage } from './TodayPage'

export const todayModule: FeatureModule = {
  id: 'today',
  title: '今天',
  icon: SunIcon,
  order: 5,
  render: TodayPage,
}
