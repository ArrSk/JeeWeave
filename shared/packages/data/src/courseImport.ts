import { diffDays, isOccurrenceActive, isoWeekday, type Block, type Occurrence } from '@jiwei/core'

/** CSV 导入时先展示的课程草稿；只有用户确认后才会写入 Block。 */
export interface CourseImportRow {
  line: number
  title: string
  teacher: string
  location: string
  weekday: number
  periodStart: number
  periodEnd: number
  weeks: number[]
  color: string
  errors: string[]
  fields: CourseImportFields
}

/** 保留文件原文，让预览中的错误可以直接修改，不丢掉非法周次/节次。 */
export interface CourseImportFields {
  title: string
  teacher: string
  location: string
  weekday: string
  periodStart: string
  periodEnd: string
  weeks: string
  color: string
}

export interface CourseImportAnalysis {
  row: CourseImportRow
  duplicate: boolean
  conflicts: string[]
}

export interface CourseImportResult {
  imported: number
  skipped: number
}

export function validateCourseImportFields(fields: CourseImportFields, options: CourseImportOptions, line: number): CourseImportRow {
  const title = fields.title.trim()
  const weekday = parseWeekday(fields.weekday.trim())
  const period = parsePeriod(fields.periodStart.trim(), fields.periodEnd.trim())
  const weeks = parseWeeks(fields.weeks, options.totalWeeks)
  const errors: string[] = []
  if (!title) errors.push('缺少课程名')
  if (weekday === null) errors.push('星期应为 1-7 或 周一至周日')
  if (!period) errors.push('节次应填写开始节和结束节')
  else if (period[0] < 1 || period[1] > options.maxPeriod || period[1] < period[0]) errors.push(`节次应在 1-${options.maxPeriod} 内`)
  if (!weeks.length) errors.push(`周次应在 1-${options.totalWeeks} 内，例如 1-${options.totalWeeks}`)
  return { line, fields: { ...fields }, title, teacher: fields.teacher.trim(), location: fields.location.trim(), weekday: weekday ?? 0, periodStart: period?.[0] ?? 0, periodEnd: period?.[1] ?? 0, weeks, color: fields.color.trim(), errors }
}

/** 重复项按课程内容和教学时间比较（忽略颜色）；重叠按共同教学周和节次提示。 */
export function analyzeCourseImport(rows: CourseImportRow[], existing: Block[], semesterId: string): CourseImportAnalysis[] {
  const candidates = existing.filter((block) => block.kind === 'course' && block.anchor.type === 'curriculum' && block.anchor.semesterId === semesterId)
  return rows.map((row) => {
    if (row.errors.length) return { row, duplicate: false, conflicts: [] }
    const draft = courseImportRowToBlock(row, semesterId, `preview_${row.line}`, '')
    const duplicate = candidates.some((block) => courseKey(block) === courseKey(draft))
    const conflicts = duplicate ? [] : [...new Set(candidates.filter((block) => {
      if (block.anchor.type !== 'curriculum') return false
      return block.anchor.weekday === row.weekday && block.anchor.periods[0] <= row.periodEnd && block.anchor.periods[1] >= row.periodStart && block.anchor.weeks.some((week) => row.weeks.includes(week))
    }).map((block) => block.title))]
    if (!duplicate) candidates.push(draft)
    return { row, duplicate, conflicts }
  })
}

function courseKey(block: Block): string {
  if (block.anchor.type !== 'curriculum') return ''
  return JSON.stringify([block.title.trim(), block.detail?.teacher?.trim() ?? '', block.detail?.location?.trim() ?? '', block.anchor.weekday, block.anchor.periods, [...new Set(block.anchor.weeks)].sort((a, b) => a - b)])
}

export interface CourseImportOptions {
  semesterId: string
  totalWeeks: number
  maxPeriod: number
  /** ICS 导入用：学期第一周周一，用来把具体日期换算成教学周。 */
  semesterStartDate?: string
  /** ICS 导入用：按日历事件的开始/结束时间匹配节次。 */
  periods?: CourseImportPeriod[]
}

interface ParsedTableCourse {
  fields: CourseImportFields
  line: number
}

/**
 * 从教务系统表格提取课程草稿的通用兜底解析器。
 * 不绑定某一所学校：不同学校只要把表格单元格传进来，就能复用同一套预览和校验。
 * 复杂格式仍会保留错误，让用户在确认前手动修正，而不是静默写入错误课表。
 */
export function parseCourseTableRows(rows: string[][], options: CourseImportOptions): CourseImportRow[] {
  const weekdayColumns = inferWeekdayColumns(rows)
  const headerPeriod = findPeriod(rows.slice(0, 5).flat().join(' '))
  const structured: ParsedTableCourse[] = []
  const fallback: ParsedTableCourse[] = []

  for (const [rowIndex, cells] of rows.entries()) {
    const normalized = cells.map(cleanTableText)
    const joined = normalized.filter(Boolean).join(' ')
    if (!joined || isTableHeader(joined)) continue
    const rowPeriod = findPeriod(joined) ?? parsePeriodIndex(normalized[0] ?? '')
    const rowWeekday = findWeekday(joined)

    // 南邮课表常见结构：第一行是“星期一…星期日”，第一列是节次，
    // 课程信息位于对应列的合并单元格中。这里按列取值，绝不删除空列。
    if (weekdayColumns.size) {
      let structuredAdded = false
      for (const [column, weekday] of weekdayColumns.entries()) {
        const cell = normalized[column] ?? ''
        if (!cell || isTableHeader(cell) || isPeriodOnly(cell) || isWeekdayOnly(cell)) continue
        for (const candidate of splitCourseCells(cell)) {
          const fields = parseCourseCell(candidate, {
            weekday: String(weekday),
            periodStart: (rowPeriod ?? headerPeriod)?.[0] ? String((rowPeriod ?? headerPeriod)![0]) : '',
            periodEnd: (rowPeriod ?? headerPeriod)?.[1] ? String((rowPeriod ?? headerPeriod)![1]) : '',
          })
          if (isCourseCandidate(candidate, fields)) {
            structured.push({ fields, line: rowIndex + 1 })
            structuredAdded = true
          }
        }
      }
      if (structuredAdded) continue
    }

    // CSV/导出插件可能只给出“每行一门课”的结构，保留原来的通用兜底。
    const inferredWeekday = rowWeekday || (weekdayColumns.size === 1 ? String([...weekdayColumns.values()][0]) : '')
    const fields = parseCourseRow(normalized, inferredWeekday, rowPeriod ?? headerPeriod)
    if (isCourseCandidate(joined, fields)) fallback.push({ fields, line: rowIndex + 1 })
  }

  return mergeStructuredTableCourses([...structured, ...fallback], options)
}

/**
 * 解析桌面端保存的南邮课表 TXT。
 * 南邮的“列表”视图会把每门课压成：星期 + 节次 + 课程名 + 周数 + 地点 + 教师。
 * 这里按“周数”作为课程块边界，保留周次单双周信息，交给同一套校验和导入预览。
 */
export function parseCourseCaptureText(text: string, options: CourseImportOptions): CourseImportRow[] {
  const normalized = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  const listStart = normalized.search(/\b课表信息\b/)
  const source = listStart >= 0 ? normalized.slice(listStart) : normalized
  const weekdaySections = /星期([一二三四五六日天])\s+([\s\S]*?)(?=\s+星期[一二三四五六日天]\s+|\s+其它课程[:：]|\s+导出\b|$)/g
  const coursePattern = /(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s+(.+?)\s+周数[:：]\s*([^\s]+周(?:\s*[单双])?(?:\s*[（(][单双][）)])?)\s+.*?上课地点[:：]\s*(.*?)\s+教师\s*[:：]\s*(.*?)(?=\s+学分[:：]|\s+课程性质[:：]|$)/g
  const rows: CourseImportRow[] = []
  let section: RegExpExecArray | null
  let line = 1
  while ((section = weekdaySections.exec(source))) {
    const weekday = section[1] ?? ''
    const body = section[2] ?? ''
    let match: RegExpExecArray | null
    coursePattern.lastIndex = 0
    while ((match = coursePattern.exec(body))) {
      const [, start = '', end = '', title = '', weeks = '', location = '', teacher = ''] = match
      rows.push(validateCourseImportFields({
        title: title.trim(),
        teacher: teacher.trim(),
        location: location.trim(),
        weekday,
        periodStart: start,
        periodEnd: end || start,
        weeks: weeks.replace(/[（(]([单双])[）)]/, '$1'),
        color: '',
      }, options, line++))
    }
  }
  return rows
}

function cleanTableText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\r?\n/g, ' | ').replace(/[ \t]+/g, ' ').trim()
}

function isTableHeader(value: string): boolean {
  if (/课程(?:名|名称|信息)?|course/i.test(value) && /星期|周次|节次|教师|教室/.test(value)) return true
  return /节次/.test(value) && (findWeekday(value) !== '' || (value.match(/星期|周[一二三四五六日天]/g) ?? []).length >= 2)
}

function isPeriodOnly(value: string): boolean {
  return /^(?:第\s*)?\d{1,2}(?:\s*[-~至到]\s*\d{1,2})?\s*节?$/.test(value)
}

function isWeekdayOnly(value: string): boolean {
  return /^(?:星期|周)[一二三四五六日天1-7]$/.test(value) || /^[一二三四五六日天1-7]$/.test(value)
}

function splitCourseCells(value: string): string[] {
  const parts = value.split(/[|｜]+/).map(cleanTableText).filter(Boolean)
  if (parts.length <= 1) return [value]
  const groups: string[] = []
  let current: string[] = []
  let hasWeek = false
  for (const part of parts) {
    const partHasWeek = Boolean(findWeeks(part))
    if (current.length && partHasWeek && hasWeek) {
      groups.push(current.join(' | '))
      current = []
      hasWeek = false
    }
    current.push(part)
    hasWeek ||= partHasWeek
  }
  if (current.length) groups.push(current.join(' | '))
  return groups.length ? groups : [value]
}

function isCourseCandidate(value: string, fields: CourseImportFields): boolean {
  const title = stripMetadata(fields.title)
  if (!title || isWeekdayOnly(title) || isPeriodOnly(title) || /^(?:课程|课程表|课表|时间|节次|上午|下午|晚上)$/.test(title)) return false
  return Boolean(findWeeks(value) || /[{【]/.test(value) || fields.teacher || fields.location || (fields.weekday && fields.periodStart))
}

function findWeekday(value: string): string {
  const match = value.match(/(?:星期|周)([一二三四五六日天1-7])/)
  return match?.[1] ?? ''
}

function findPeriod(value: string): [number, number] | null {
  const range = value.match(/(?:第\s*)?(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*节/) ?? value.match(/第\s*(\d{1,2})\s*节/)
  if (!range) return null
  const start = Number(range[1])
  const end = Number(range[2] ?? range[1])
  return Number.isInteger(start) && Number.isInteger(end) ? [start, end] : null
}

function parsePeriodIndex(value: string): [number, number] | null {
  const match = value.trim().match(/^(\d{1,2})$/)
  return match ? [Number(match[1]), Number(match[1])] : null
}

function inferWeekdayColumns(rows: string[][]): Map<number, number> {
  const result = new Map<number, number>()
  for (const row of rows.slice(0, 5)) {
    row.forEach((cell, column) => {
      const normalized = cleanTableText(cell)
      const weekday = parseWeekday(findWeekday(normalized)) ?? (/^[一二三四五六日天1-7]$/.test(normalized) ? parseWeekday(normalized) : null)
      if (weekday !== null) result.set(column, weekday)
    })
    if (result.size >= 2) break
  }
  return result
}

function parseCourseRow(cells: string[], weekday: string, period: [number, number] | null): CourseImportFields {
  const text = cells.filter(Boolean)
  if (text.length === 1 && /[|｜]|教师|老师|教室|地点/.test(text[0] ?? '')) {
    return parseCourseCell(text[0] ?? '', {
      weekday,
      periodStart: period ? String(period[0]) : '',
      periodEnd: period ? String(period[1]) : '',
    })
  }
  const joined = text.join(' ')
  const weeks = findWeeks(joined)
  const explicitPeriod = period ?? findPeriod(joined)
  const title = text.find((cell) => !isMetadataCell(cell)) ?? ''
  const teacher = text.find((cell) => isTeacherCell(cell)) ?? text[1] ?? ''
  const location = text.find((cell) => isLocationCell(cell)) ?? text[2] ?? ''
  return {
    title: stripMetadata(title),
    teacher: stripMetadata(teacher),
    location: stripMetadata(location),
    weekday,
    periodStart: explicitPeriod ? String(explicitPeriod[0]) : '',
    periodEnd: explicitPeriod ? String(explicitPeriod[1]) : '',
    weeks,
    color: '',
  }
}

function parseCourseCell(cell: string, context: { weekday: string; periodStart: string; periodEnd: string }): CourseImportFields {
  const braced = cleanTableText(cell).match(/^(.+?)\s*[{【]\s*([\s\S]*?)[}】]?\s*$/)
  if (braced) {
    const title = cleanTableText(braced[1] ?? '')
    const metadata = cleanTableText(braced[2] ?? '')
    const period = findPeriod(`${title} ${metadata}`)
    const weeks = findWeeks(metadata)
    const withoutWeeks = stripMetadata(metadata)
    const explicitTeacher = withoutWeeks.match(/(?:任课教师|教师)[:：]?\s*([^,，;；|]+)/)?.[1]?.trim() ?? ''
    const explicitLocation = withoutWeeks.match(/(?:教室|地点|上课地点)[:：]?\s*([^,，;；|]+)/)?.[1]?.trim() ?? ''
    const tokens = withoutWeeks.split(/\s+/).filter(Boolean)
    const locationToken = explicitLocation || tokens.find(isLocationCell) || ''
    const locationIndex = locationToken ? tokens.indexOf(locationToken) : -1
    const teacher = explicitTeacher || (locationIndex > 0 ? tokens.slice(0, locationIndex).join(' ') : tokens.find(isTeacherCell) ?? '')
    const location = explicitLocation || locationToken
    return {
      title: stripMetadata(title),
      teacher: stripMetadata(teacher),
      location: stripMetadata(location),
      weekday: findWeekday(`${title} ${metadata}`) || context.weekday,
      periodStart: period ? String(period[0]) : context.periodStart,
      periodEnd: period ? String(period[1]) : context.periodEnd,
      weeks,
      color: '',
    }
  }
  const parts = cell.split(/[\n|｜]+/).map(cleanTableText).filter(Boolean)
  const joined = parts.join(' ')
  const period = findPeriod(joined)
  const weekday = findWeekday(joined) || context.weekday
  const title = parts.find((part) => !isMetadataCell(part)) ?? ''
  const teacher = parts.find(isTeacherCell) ?? ''
  const location = parts.find(isLocationCell) ?? ''
  return {
    title: stripMetadata(title),
    teacher: stripMetadata(teacher),
    location: stripMetadata(location),
    weekday,
    periodStart: period ? String(period[0]) : context.periodStart,
    periodEnd: period ? String(period[1]) : context.periodEnd,
    weeks: findWeeks(joined),
    color: '',
  }
}

function findWeeks(value: string): string {
  const match = value.match(/(?:第\s*)?([0-9]{1,2}(?:\s*[-~至到]\s*[0-9]{1,2})?(?:\s*[,，、]\s*[0-9]{1,2})*)\s*(?:(单|双)\s*)?周(?:次)?(?:\s*[（(]?\s*(单|双)\s*[)）]?)?/)
  if (!match) return ''
  const suffix = match[2] || match[3] || (/双/.test(value) ? '双' : /单/.test(value) ? '单' : '')
  return `${match[1]}${suffix}`
}

function isMetadataCell(value: string): boolean {
  return Boolean(findWeekday(value) || findPeriod(value) || findWeeks(value) || isTeacherCell(value) || isLocationCell(value) || /^(?:第?\d{1,2})$/.test(value))
}

function isTeacherCell(value: string): boolean {
  return /(?:老师|教师|教授|讲师|助教)[:：]?/.test(value) || /^[\u4e00-\u9fa5]{2,4}(?:\s*[、,，]\s*[\u4e00-\u9fa5]{2,4})+$/.test(value)
}

function isLocationCell(value: string): boolean {
  return /(?:教室|地点|上课地点|校区|楼|栋|室)[:：]?/.test(value) || /[A-Za-z\u4e00-\u9fa5]{1,8}[-－]?\d{2,4}(?:室)?$/.test(value)
}

function stripMetadata(value: string): string {
  return value
    .replace(/(?:星期|周)[一二三四五六日天1-7]/g, '')
    .replace(/(?:第\s*)?\d{1,2}\s*[-~至到]\s*\d{1,2}\s*节/g, '')
    .replace(/第?\s*\d{1,2}(?:\s*[-~至到]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2})*\s*(?:[单双])?周(?:次)?(?:\s*[单双])?/g, '')
    .replace(/^(?:教师|老师|教室|地点|上课地点)[:：]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mergeStructuredTableCourses(items: ParsedTableCourse[], options: CourseImportOptions): CourseImportRow[] {
  const merged = new Map<string, ParsedTableCourse>()
  for (const item of items) {
    const fields = item.fields
    const key = JSON.stringify([stripMetadata(fields.title), stripMetadata(fields.teacher), stripMetadata(fields.location), fields.weekday])
    const previous = merged.get(key)
    if (previous && fields.periodStart && fields.periodEnd) {
      const start = Math.min(Number(previous.fields.periodStart) || Number(fields.periodStart), Number(fields.periodStart))
      const end = Math.max(Number(previous.fields.periodEnd) || Number(fields.periodEnd), Number(fields.periodEnd))
      previous.fields.periodStart = String(start)
      previous.fields.periodEnd = String(end)
      previous.fields.weeks = mergeWeekText(previous.fields.weeks, fields.weeks)
      continue
    }
    merged.set(key, { fields: { ...fields }, line: item.line })
  }
  return [...merged.values()].map(({ fields, line }) => validateCourseImportFields(fields, options, line))
}

function mergeWeekText(first: string, second: string): string {
  if (!first) return second
  if (!second || first === second) return first
  const values = new Set<number>()
  for (const value of `${first},${second}`.replace(/[单双]/g, '').split(/[,，]/)) {
    const range = value.match(/^(\d+)\s*[-~至到]\s*(\d+)$/)
    if (range) for (let i = Number(range[1]); i <= Number(range[2]); i += 1) values.add(i)
    else if (/^\d+$/.test(value)) values.add(Number(value))
  }
  return [...values].sort((a, b) => a - b).join(',')
}

export interface CourseImportPeriod {
  index: number
  start: string
  end: string
}

/**
 * 解析简单课程 CSV。支持中文或英文表头：
 * 课程名,title；教师,teacher；教室,location；星期,weekday；开始节,periodStart；
 * 结束节,periodEnd；周次,weeks；颜色,color。
 *
 * 这里只生成草稿，不读写数据库。这样文件内容可以先在界面中预览和修改，
 * 也为后续 AI 识图复用同一个草稿格式。
 */
export function parseCourseCsv(text: string, options: CourseImportOptions): CourseImportRow[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error('文件至少需要一行表头和一行课程')

  const headers = (rows[0] ?? []).map(normalizeHeader)
  const index = (names: string[]) => names.map(normalizeHeader).map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1
  const columns = {
    title: index(['课程名', '课程', '名称', 'title', 'name']),
    teacher: index(['教师', '老师', 'teacher']),
    location: index(['教室', '地点', 'location']),
    weekday: index(['星期', '周几', 'weekday', 'day']),
    periodStart: index(['开始节', '起始节', '开始节次', 'periodstart', 'start']),
    periodEnd: index(['结束节', '结束节次', 'periodend', 'end']),
    weeks: index(['周次', '教学周', 'weeks', 'week']),
    color: index(['颜色', 'color']),
  }
  for (const required of ['title', 'weekday', 'periodStart'] as const) {
    if (columns[required] < 0) throw new Error(`缺少必需表头：${required === 'title' ? '课程名' : required === 'weekday' ? '星期' : '开始节'}`)
  }

  return rows.slice(1).flatMap((cells, rowIndex) => {
    if (cells.every((cell) => !cell.trim())) return []
    const get = (key: keyof typeof columns) => columns[key] >= 0 ? (cells[columns[key]] ?? '').trim() : ''
    return [validateCourseImportFields({ title: get('title'), teacher: get('teacher'), location: get('location'), weekday: get('weekday'), periodStart: get('periodStart'), periodEnd: get('periodEnd'), weeks: get('weeks'), color: get('color') }, options, rowIndex + 2)]
  })
}

export function courseImportTemplate(): string {
  return '\ufeff课程名,教师,教室,星期,开始节,结束节,周次,颜色\n高等数学,张老师,教西-101,一,1,2,1-16,\n'
}

/**
 * 解析 ICS 日历文件为课程草稿。
 *
 * 优先识别几微导出的 X-JIWEI-* 字段；普通日历事件也可导入，
 * 但必须能用当前作息表的时间匹配出节次。多个具体课次会按课程、教师、地点、
 * 星期和节次合并成一门课，并把日期换算成教学周。
 */
export function parseCourseIcs(text: string, options: CourseImportOptions): CourseImportRow[] {
  const events = parseIcsEvents(text)
  if (!events.length) throw new Error('ICS 文件中没有找到课程事件')
  if (!options.semesterStartDate) throw new Error('导入 ICS 前需要当前课表的开学日')
  if (!options.periods?.length) throw new Error('导入 ICS 前需要先配置作息时间')

  const grouped = new Map<string, { fields: CourseImportFields; weeks: Set<number>; extraErrors: string[]; line: number }>()
  for (const [index, event] of events.entries()) {
    const line = index + 1
    const title = event.SUMMARY?.trim() ?? ''
    const start = parseIcsDate(event.DTSTART)
    const end = parseIcsDate(event.DTEND)
    const explicitWeekday = numberField(event['X-JIWEI-WEEKDAY'])
    const explicitPeriods = parsePeriodText(event['X-JIWEI-PERIODS'])
    const weekday = explicitWeekday ?? (start ? isoWeekday(start.date) : 0)
    const matched = explicitPeriods ?? (start && end ? matchPeriods(start.time, end.time, options.periods) : null)
    const dateWeek = numberField(event['X-JIWEI-WEEK'])
    const week = dateWeek ?? (start ? Math.floor(diffDays(options.semesterStartDate, start.date) / 7) + 1 : 0)
    const fields: CourseImportFields = {
      title,
      teacher: teacherFromDescription(event.DESCRIPTION),
      location: event.LOCATION?.trim() ?? '',
      weekday: String(weekday || ''),
      periodStart: matched ? String(matched[0]) : '',
      periodEnd: matched ? String(matched[1]) : '',
      weeks: week > 0 ? String(week) : '',
      color: event['X-JIWEI-COLOR']?.trim() ?? '',
    }
    const extraErrors: string[] = []
    if (!start) extraErrors.push('缺少或无法解析开始时间')
    if (!end) extraErrors.push('缺少或无法解析结束时间')
    if (start && end && !matched) extraErrors.push('日历时间无法匹配当前作息节次')
    if (week < 1 || week > options.totalWeeks) extraErrors.push(`日期不在当前学期的 1-${options.totalWeeks} 周内`)
    const key = event['X-JIWEI-BLOCK-ID']?.trim() || JSON.stringify([title, fields.teacher, fields.location, weekday, matched])
    const existing = grouped.get(key)
    if (existing) {
      if (week > 0) existing.weeks.add(week)
      existing.extraErrors.push(...extraErrors)
    } else {
      grouped.set(key, { fields, weeks: new Set(week > 0 ? [week] : []), extraErrors, line })
    }
  }

  return [...grouped.values()].map(({ fields, weeks, extraErrors, line }) => {
    const row = validateCourseImportFields({ ...fields, weeks: [...weeks].sort((a, b) => a - b).join(',') }, options, line)
    row.errors.push(...extraErrors.filter((error, index, list) => list.indexOf(error) === index))
    return row
  })
}

/** 把当前课表导出成可再次导入的 CSV；只导出课程 Block，不包含派生课次。 */
export function exportCourseCsv(blocks: Block[]): string {
  const courses = blocks
    .filter((block) => block.kind === 'course' && block.anchor.type === 'curriculum')
    .sort((a, b) => {
      if (a.anchor.type !== 'curriculum' || b.anchor.type !== 'curriculum') return 0
      return a.anchor.weekday - b.anchor.weekday || a.anchor.periods[0] - b.anchor.periods[0] || a.title.localeCompare(b.title)
    })
  const lines = ['课程名,教师,教室,星期,开始节,结束节,周次,颜色']
  for (const block of courses) {
    if (block.anchor.type !== 'curriculum') continue
    lines.push([
      block.title,
      block.detail?.teacher ?? '',
      block.detail?.location ?? '',
      String(block.anchor.weekday),
      String(block.anchor.periods[0]),
      String(block.anchor.periods[1]),
      formatWeeksForCsv(block.anchor.weeks),
      block.color ?? '',
    ].map(csvCell).join(','))
  }
  return `\ufeff${lines.join('\n')}\n`
}

/** 导出当前学期的具体课次，供系统日历导入；停课课次不会写入日历。 */
export function exportCourseIcs(blocks: Block[], occurrences: Occurrence[], calendarName = '几微课程表'): string {
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const events = occurrences
    .filter(isOccurrenceActive)
    .map((occurrence) => ({ occurrence, block: blockById.get(occurrence.blockId) }))
    .filter((item): item is { occurrence: Occurrence; block: Block } => Boolean(item.block))
    .sort((a, b) => a.occurrence.start.localeCompare(b.occurrence.start))
    .map(({ occurrence, block }) => {
      const title = occurrence.override?.title ?? block.title
      const location = occurrence.override?.location ?? block.detail?.location ?? ''
      const weekday = block.anchor.type === 'curriculum' ? block.anchor.weekday : isoWeekday(occurrence.date)
      const periods = block.anchor.type === 'curriculum' ? block.anchor.periods : [0, 0]
      return [
        'BEGIN:VEVENT',
        `UID:${icsCell(occurrence.id)}@jiwei`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART;TZID=Asia/Shanghai:${icsDate(new Date(occurrence.override?.start ?? occurrence.start))}`,
        `DTEND;TZID=Asia/Shanghai:${icsDate(new Date(occurrence.override?.end ?? occurrence.end))}`,
        `SUMMARY:${icsCell(title)}`,
        ...(location ? [`LOCATION:${icsCell(location)}`] : []),
        ...(block.detail?.teacher ? [`DESCRIPTION:${icsCell(`教师：${block.detail.teacher}`)}`] : []),
        ...(block.anchor.type === 'curriculum' ? [
          `X-JIWEI-BLOCK-ID:${icsCell(block.id)}`,
          `X-JIWEI-WEEKDAY:${weekday}`,
          `X-JIWEI-PERIODS:${periods[0]}-${periods[1]}`,
          ...(block.color ? [`X-JIWEI-COLOR:${icsCell(block.color)}`] : []),
        ] : []),
        'END:VEVENT',
      ].join('\r\n')
    })
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jiwei//Course Calendar//CN',
    `X-WR-CALNAME:${icsCell(calendarName)}`,
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function courseImportRowToBlock(row: CourseImportRow, semesterId: string, id: string, now: string): Block {
  return {
    id,
    kind: 'course',
    title: row.title,
    anchor: { type: 'curriculum', semesterId, weekday: row.weekday, periods: [row.periodStart, row.periodEnd], weeks: row.weeks },
    repeat: { mode: 'curriculum', semesterId, weeks: row.weeks },
    detail: {
      ...(row.teacher ? { teacher: row.teacher } : {}),
      ...(row.location ? { location: row.location } : {}),
    },
    ...(row.color ? { color: row.color } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeHeader(value: string): string {
  return value.replace(/^\ufeff/, '').replace(/[\s_\-]/g, '').toLowerCase()
}

function parseWeekday(value: string): number | null {
  const n = Number(value.replace(/^(星期|周)/, ''))
  if (Number.isInteger(n) && n >= 1 && n <= 7) return n
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  const index = labels.indexOf(value.replace(/^星期|^周/, ''))
  return index >= 0 ? index + 1 : null
}

function parsePeriod(startText: string, endText: string): [number, number] | null {
  if (!startText) return null
  const combined = startText.match(/^(\d+)\s*[-~至]\s*(\d+)$/)
  if (combined && !endText) return [Number(combined[1]), Number(combined[2])]
  const start = Number(startText)
  const end = endText ? Number(endText) : start
  return Number.isInteger(start) && Number.isInteger(end) ? [start, end] : null
}

function parseWeeks(value: string, totalWeeks: number): number[] {
  if (!value.trim()) return Array.from({ length: totalWeeks }, (_, i) => i + 1)
  const odd = /单/.test(value)
  const even = /双/.test(value)
  if (odd && even) return []
  const cleaned = value.replace(/[单双周\s]/g, '')
  if (!cleaned) return Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((week) => odd ? week % 2 === 1 : even ? week % 2 === 0 : true)
  const weeks = new Set<number>()
  for (const part of cleaned.split(/[,，]/)) {
    const range = part.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (range) {
      const start = Number(range[1]), end = Number(range[2])
      if (start < 1 || end > totalWeeks || end < start) return []
      for (let i = start; i <= end; i += 1) weeks.add(i)
    } else if (/^\d+$/.test(part)) {
      const week = Number(part)
      if (week < 1 || week > totalWeeks) return []
      weeks.add(week)
    } else return []
  }
  return [...weeks].filter((week) => week >= 1 && week <= totalWeeks)
    .filter((week) => (odd ? week % 2 === 1 : true))
    .filter((week) => (even ? week % 2 === 0 : true))
    .sort((a, b) => a - b)
}

function formatWeeksForCsv(weeks: number[]): string {
  const sorted = [...weeks].sort((a, b) => a - b)
  if (!sorted.length) return ''
  const contiguous = sorted.every((week, index) => index === 0 || week === sorted[index - 1]! + 1)
  if (contiguous) return `${sorted[0]}-${sorted[sorted.length - 1]}`
  const odd = sorted.every((week) => week % 2 === 1)
  const even = sorted.every((week) => week % 2 === 0)
  if (odd && sorted[0] === 1) return `1-${sorted[sorted.length - 1]}单`
  if (even && sorted[0] === 2) return `1-${sorted[sorted.length - 1]}双`
  return sorted.join(',')
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function icsCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n')
}

function icsDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value
    return result
  }, {})
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (quoted) throw new Error('CSV 引号未闭合，请检查课程名或教室中的引号')
  return rows
}

function parseIcsEvents(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const unfolded: string[] = []
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) unfolded[unfolded.length - 1] += line.slice(1)
    else unfolded.push(line)
  }
  const events: Array<Record<string, string>> = []
  let current: Record<string, string> | null = null
  for (const line of unfolded) {
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (upper === 'END:VEVENT') {
      if (current) events.push(current)
      current = null
      continue
    }
    if (!current) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const rawKey = line.slice(0, colon).split(';', 1)[0]?.trim().toUpperCase()
    if (!rawKey) continue
    current[rawKey] = unescapeIcs(line.slice(colon + 1))
  }
  return events
}

function unescapeIcs(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1')
}

function parseIcsDate(value: string | undefined): { date: string; time: string } | null {
  if (!value) return null
  const compact = value.trim()
  const match = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if (!match) return null
  if (!match[5]) return null
  if (match[7]) {
    const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0)))
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(utc).reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value
      return result
    }, {})
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
  }
  return { date: `${match[1]}-${match[2]}-${match[3]}`, time: `${match[4]}:${match[5]}` }
}

function matchPeriods(start: string, end: string, periods: CourseImportPeriod[]): [number, number] | null {
  const first = periods.find((period) => period.start === start)
  const last = periods.find((period) => period.end === end)
  return first && last && last.index >= first.index ? [first.index, last.index] : null
}

function parsePeriodText(value: string | undefined): [number, number] | null {
  const match = value?.trim().match(/^(\d+)\s*[-~]\s*(\d+)$/)
  if (!match) return null
  return [Number(match[1]), Number(match[2])]
}

function numberField(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null
  const number = Number(value.trim())
  return Number.isInteger(number) ? number : null
}

function teacherFromDescription(value: string | undefined): string {
  const match = value?.match(/(?:教师|老师)\s*[：:]\s*(.+)/)
  return match?.[1]?.trim() ?? ''
}
