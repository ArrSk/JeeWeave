interface SemesterCalendarInput { startDate: string; totalWeeks: number }
export function dateForWeek(semester: Pick<SemesterCalendarInput, 'startDate'>, week: number, weekday: number): string
export function currentWeek(semester: SemesterCalendarInput, date: string): number
export function today(): string
export function weekdayOf(date: string): number
export function mondayOf(date: string): string
