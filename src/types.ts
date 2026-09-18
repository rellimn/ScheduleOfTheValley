export type DayMap = [string, string, string, string, string, string, string]

export type Day = number

export interface Stream {
    weekDay: Day
    hours: number
    minutes: number
    noteText: string
    id: string
}

export interface Data {
    startOfWeek: Date
    headerText: string
    descriptionText: string
    footerText: string
    streams: Stream[]
    dayMap: DayMap
    timePrefix: string
    outputMissingDates: boolean
    missingDatePlaceholder: string
    theme: "dark" | "light"
}