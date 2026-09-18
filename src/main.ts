import "@picocss/pico/css/pico.min.css"
import './style.css'
import "flatpickr/dist/flatpickr.min.css"

import {Calendar, CalendarChevronsRight, Copy, createIcons, Moon, Plus, Sun, CircleCheckBig, X, Settings} from 'lucide'
import flatpickr from "flatpickr"
import weekSelect from "flatpickr/dist/plugins/weekSelect/weekSelect"
import {toHTML, parser as mdParser, output as HTMLOutput} from "@odiffey/discord-markdown"

import type {Data, DayMap, Stream} from "./types.ts"

const STORAGE_KEY = "SOTV-state"

const rootEl = document.documentElement
const themeToggleEl = document.querySelector("#theme-toggle")!
const preferencesEl: HTMLButtonElement = document.querySelector("#preferences")!
const preferencesDialogEl: HTMLDialogElement = document.querySelector("#preferences-dialog")!
const closePreferencesEl: HTMLButtonElement = document.querySelector("#close-preferences")!
const preferencesFormEl = document.querySelector("#preferences-form")!
const mainFormEl = document.querySelector("#main-form")!
const weekEl: HTMLInputElement = document.querySelector("#week")!
const currentWeekEl: HTMLButtonElement = document.querySelector("#current-week")!
const nextWeekEl: HTMLButtonElement = document.querySelector("#next-week")!
const descriptionEl: HTMLInputElement = document.querySelector("#description")!
const headerTextEl: HTMLInputElement = document.querySelector("#header-text")!
const timePrefixEl: HTMLInputElement = document.querySelector("#time-prefix")!
const missingDatePlaceholderEl: HTMLInputElement = document.querySelector("#missing-date-placeholder")!
const outputMissingDatesEl: HTMLInputElement = document.querySelector("#output-missing-dates")!
const footerTextEl: HTMLTextAreaElement = document.querySelector("#footer-text")!
const dayMapEls = document.querySelectorAll<HTMLInputElement>("input[name=dayMap]")
const streamsEl = document.querySelector("#streams")!
const previewEl = document.querySelector("#preview-text")!
const addStreamEl = document.querySelector("#add-stream")!
const copyMarkdownEl: HTMLButtonElement = document.querySelector("#copy-markdown")!
const streamTemplateEl: HTMLTemplateElement = document.querySelector("#stream-template")!

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)")

let state: Data = {
    startOfWeek: startOfWeek(new Date()),
    headerText: "Schedule: $$start – $$end",
    descriptionText: "",
    footerText: "-# The times and dates shown are already converted to your timezone!!\n\n@Petals",
    streams: [],
    dayMap: ["**MON**:", "**TUE**:", "**WED**:", "**THU**:", "**FRI**:", "**SAT**:", "**SUN**:"],
    timePrefix: "  ⬜  ",
    outputMissingDates: true,
    missingDatePlaceholder: "No Stream",
    theme: "light"
}

createIcons({
    icons: {Sun, Moon, Copy, Plus, CircleCheckBig, Settings, Calendar, CalendarChevronsRight}
})

const flatpickrInstance = flatpickr(weekEl, {
    weekNumbers: true,
    locale: {
        firstDayOfWeek: 1 // start on monday
    },
    // @ts-expect-error
    plugins: [new weekSelect()],
    altInput: true,
    onChange: updateFlatpickr,
    defaultDate: new Date()
})

function updateFlatpickr(this: flatpickr.Instance) {
    // extract the week number
    // note: "this" is bound to the flatpickr instance
    const weekNumber = this.selectedDates[0]
        ? this.config.getWeek(this.selectedDates[0])
        : null
    const {start, end} = getWeekRange(this.selectedDates[0])
    // const dateStringOptionsWide = {day: "numeric", month: "long", year: "numeric"} as const
    const dateStringOptions = {day: "numeric", month: "short"} as const
    const mondayRepr = start.toLocaleDateString([], dateStringOptions)
    const sundayRepr = end.toLocaleDateString([], dateStringOptions)

    updateState("startOfWeek", start)

    if (this.altInput) {
        this.altInput.value = `${mondayRepr} - ${sundayRepr} (Week ${weekNumber})`
    }
    updatePreview()
}

function startOfWeek(date: Date) {
    const start = new Date(date)
    start.setHours(12, 0, 0, 0)

    // Convert Sunday=0 ... Saturday=6
    // into Monday=0 ... Sunday=6.
    const daysSinceMonday = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - daysSinceMonday)
    return start
}

function sundayFromMonday(date: Date) {
    if (date.getDay() !== 1) {
        throw new Error("Invalid argument, date must be a Monday.")
    }
    const sunday = new Date(date)
    sunday.setDate(date.getDate() + 6)
    return sunday
}

function getWeekRange(date: Date) {
    const start = startOfWeek(date)

    const end = new Date(start)
    end.setDate(start.getDate() + 6)

    return {start, end}
}

function jumpToWeek(offset: number) {
    const date = startOfWeek(new Date())
    date.setDate(date.getDate() + offset * 7)
    flatpickrInstance.setDate(date, true)
}

function currentTheme() {
    if (rootEl.dataset.theme === "dark" || rootEl.dataset.theme === "light") {
        return rootEl.dataset.theme
    }
    return prefersDark.matches ? "dark" : "light"
}

function updateThemeButton() {
    const current = currentTheme()
    updateState("theme", current)
    const next = current === "dark" ? "light" : "dark"
    const label = `Switch to ${next} mode`
    const iconName = next === "dark" ? "moon" : "sun"

    themeToggleEl.setAttribute("aria-label", label)
    themeToggleEl.setAttribute("title", label)
    themeToggleEl.innerHTML = `<i data-lucide="${iconName}"></i>`
    createIcons({icons: {Sun, Moon}})
}

type StreamOrPlaceholder = (Stream & {isPlaceholder: false}| {
    weekDay: number
    isPlaceholder: true
})

function compareStreamDates(a: Stream, b: Stream) {
    const toNumber = (stream: Stream) => stream.minutes + stream.hours * 100 + stream.weekDay * 10000
    return toNumber(a) - toNumber(b)
}

function getMarkdown() {
    const header = state.headerText ? `# ${state.headerText}\n` : []
    const description = state.descriptionText ? `${state.descriptionText}\n\n` : []
    const footer = state.footerText ? `${state.footerText}` : ""

    const streamsSorted = state.streams.sort(compareStreamDates)
    const complete: StreamOrPlaceholder[] = []
    if (state.outputMissingDates) {
        let i = 0;
        for (let day = 0; day < 7; day++) {
            const start = i;

            while (streamsSorted[i]?.weekDay === day) {
                complete.push({...streamsSorted[i++], isPlaceholder: false});
            }

            if (i === start) {
                complete.push({
                    weekDay: day,
                    isPlaceholder: true
                });
            }
        }
    } else {
        complete.push(...state.streams.map(s => ({...s, isPlaceholder: false})))
    }


    const streamsJoined = complete
        .map((stream) => {
            const prefix = state.dayMap[stream.weekDay] ? state.dayMap[stream.weekDay] : ""
            if (stream.isPlaceholder) {
                return `${prefix} ${state.missingDatePlaceholder}\n`
            }
            const date = new Date(state.startOfWeek)
            date.setHours(stream.hours)
            date.setMinutes(stream.minutes)
            date.setDate(state.startOfWeek.getDate() + stream.weekDay)
            const time = date.getTime() / 1000
            const timePrefix = state.timePrefix ? state.timePrefix : ""
            const timeString = Number.isNaN(time) ? "" : `${timePrefix}<t:${time}>`
            const notes = stream.noteText ? `  ${stream.noteText}` : ""
            return `${prefix}${timeString}${notes}\n`
        }).join("\n")

    const md = `${header}${description}${streamsJoined}${footer}`.trim()
    const startOfWeek = state.startOfWeek.toLocaleDateString("en-US", {month: "short", day: "numeric"})
    const endOfWeekDate = sundayFromMonday(state.startOfWeek)
    const endOfWeek = endOfWeekDate.toLocaleDateString("en-US", {month: "short", day: "numeric"})
    return md.replace("$$start", startOfWeek).replace("$$end", endOfWeek)
}

// @ts-expect-error
function customHTMLOutput(node, state) {
    if (Array.isArray((node))) {
        // @ts-expect-error
        return node.map(singleNode => customHTMLOutput(singleNode, state)).join("")
    }
    if (node.type === "heading") {
        // @ts-expect-error
        return `<h${node.level + 3}>${node.content.map(child => customHTMLOutput(child, state)).join("")}</h${node.level + 2}>`
    }
    if (node.type === "footnote") {
        // @ts-expect-error
        return `<small>${node.content.map(child => customHTMLOutput(child, state)).join("")}</small><br/>`
    }
    return HTMLOutput(node, state)
}


function updatePreview() {
    const md = getMarkdown()
    const html = toHTML(md, {
        discordCallback: {
            timestamp: ({timestamp}) => {
                const defaultStyle = {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric"

                } as const
                const date = new Date(timestamp * 1000)
                return `<time class="discord-timestamp" datetime="${date.toISOString()}">${date.toLocaleString([], defaultStyle)}</time>`
            }
        }
    }, mdParser, customHTMLOutput)
    previewEl.innerHTML = html
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        console.warn("Could not save form state", err);
    }
}

// Debounce saves
let saveTimer: number
function scheduleSave() {
    clearTimeout(saveTimer)

    saveTimer = setTimeout(() => {
        saveState();
    }, 300);
}


function updateState<E extends keyof Data>(field: E, value: Data[E]) {
    state[field] = value
    updatePreview()
    scheduleSave()
}

function updateStream<E extends keyof Stream>(id: string, field: E, value: Stream[E]) {
    const stream = state.streams.find(s => s.id === id)
    if (stream) {
        stream[field] = value
        updatePreview()
        scheduleSave()
    } else {
        console.error(`Stream with id ${id} not found`)
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const raw = JSON.parse(saved)
            state = {
                ...state,              // defaults for newly added fields
                ...raw,
                startOfWeek: new Date(raw.startOfWeek)
            };
        }
    } catch (err) {
        console.warn("Could not restore saved form state", err);
    }
    rootEl.dataset.theme = state.theme
    descriptionEl.value = state.descriptionText
    headerTextEl.value = state.headerText
    timePrefixEl.value = state.timePrefix
    missingDatePlaceholderEl.value = state.missingDatePlaceholder
    outputMissingDatesEl.checked = state.outputMissingDates
    footerTextEl.value = state.footerText
    dayMapEls.forEach((input) => {
        const dayIndex = Number(input.dataset.dayIndex)
        input.value = state.dayMap[dayIndex] ?? ""
    })
    flatpickrInstance.setDate(state.startOfWeek)
    for (const stream of state.streams) {
        appendStreamHtml(stream)
    }
}

function appendStreamHtml(stream: Stream) {
    const clone = streamTemplateEl.content.cloneNode(true)
    streamsEl.appendChild(clone)
    const streamEl = streamsEl.lastElementChild!
    if (streamEl instanceof HTMLElement) {
        streamEl.dataset.streamId = stream.id
        const dayEl: HTMLSelectElement = streamEl.querySelector("select[name=streamDay]")!
        const timeEl: HTMLInputElement = streamEl.querySelector("input[name=streamTime]")!
        const notesEl: HTMLInputElement = streamEl.querySelector("input[name=streamNotes]")!
        const hours = String(stream.hours).padStart(2, "0")
        const mins = String(stream.minutes).padStart(2, "0")
        dayEl.value = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][stream.weekDay]
        timeEl.value = `${hours}:${mins}`
        notesEl.value = stream.noteText
    }
    createIcons({icons: {X}})
}

function addStream() {
    const stream: Stream = {
        weekDay: 0,
        hours: 12,
        minutes: 0,
        noteText: "",
        id: crypto.randomUUID()
    }
    state.streams.push(stream)
    appendStreamHtml(stream)
    updatePreview()
}

function removeStream(id: string) {
    state.streams = state.streams.filter(s => s.id !== id)
    updatePreview()
    scheduleSave()
}

function removeStreamByHtmlRow(streamRow: HTMLElement) {
    const streamId = streamRow.dataset.streamId
    if (!streamId) {
        console.error("Missing stream id")
        return
    }
    removeStream(streamId)
    streamRow.remove()
}

themeToggleEl.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark"

    rootEl.dataset.theme = next
    localStorage.setItem("theme", next)
    updateThemeButton()
})
preferencesEl.addEventListener("click", () => {
    preferencesDialogEl.showModal()
})
closePreferencesEl.addEventListener("click", () => {
    preferencesDialogEl.close()
})
preferencesDialogEl.addEventListener("click", (event) => {
    if (event.target === preferencesDialogEl) {
        preferencesDialogEl.close()
    }
})

// Keeps the label correct when no preference has been saved
// and the OS theme changes while the page is open.
prefersDark.addEventListener("change", updateThemeButton)

preferencesFormEl.addEventListener("input", (event) => {
    const target = event.target
    if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
    ) {
        return
    }

    if (target.name === "dayMap") {
        const dayIndex = Number(target.dataset.dayIndex)
        if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
            return
        }
        const dayMap = [...state.dayMap] as DayMap
        dayMap[dayIndex] = target.value
        updateState("dayMap", dayMap)
        return
    }

    if (target.name === "outputMissingDates" && target instanceof HTMLInputElement) {
        updateState("outputMissingDates", target.checked)
        return
    }

    if (target.name === "headerText") {
        updateState("headerText", target.value)
        return
    }

    if (target.name === "timePrefix") {
        updateState("timePrefix", target.value)
        return
    }

    if (target.name === "missingDatePlaceholder") {
        updateState("missingDatePlaceholder", target.value)
        return
    }

    if (target.name === "footerText") {
        updateState("footerText", target.value)
    }
})

mainFormEl.addEventListener("input", (event) => {
    const target = event.target
    if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLSelectElement) &&
        !(target instanceof HTMLTextAreaElement)
    ) {
        return
    }
    const {name, value} = target

    // week handled by flatpickr

    if (name === "description") {
        updateState("descriptionText", value)
        return
    }

    const streamRow: HTMLElement | null = target.closest(".stream-container")
    if (!streamRow) {
        return
    }

    const streamId = streamRow.dataset.streamId
    if (!streamId) {
        console.error("Missing stream id")
        return
    }

    const stream = state.streams.find(stream => stream.id === streamId)
    if (!stream) {
        console.error("Can't find stream by id")
        return
    }

    const update = function<E extends keyof Stream>(field: E, value: Stream[E]) {
        updateStream(streamId, field, value)
    }

    if (name === "streamDay" && target instanceof HTMLSelectElement && target.selectedIndex != -1) {
        update("weekDay", target.selectedIndex)
        return
    }

    if (name === "streamTime") {
        const [hours, minutes] = value.split(":")
        update("hours", Number(hours))
        update("minutes", Number(minutes))
        return
    }

    if (name === "streamNotes") {
        update("noteText", value)
        return
    }
})

// Add stream on click
addStreamEl.addEventListener("click", addStream)
// Jump week picker on click
currentWeekEl.addEventListener("click", () => jumpToWeek(0))
nextWeekEl.addEventListener("click", () => jumpToWeek(1))
// Copy markdown on click
copyMarkdownEl.addEventListener("click", async () => {
    await navigator.clipboard.writeText(getMarkdown())
    copyMarkdownEl.innerHTML = `<i data-lucide="circle-check-big"></i>`
    copyMarkdownEl.disabled = true
    copyMarkdownEl.classList.add("button-clicked")
    createIcons({icons: {CircleCheckBig}})
    setTimeout(() => {
        copyMarkdownEl.innerHTML = `<i data-lucide="copy"></i>`
        createIcons({icons: {Copy}})
        copyMarkdownEl.disabled = false
        copyMarkdownEl.classList.remove("button-clicked")
    }, 500)
})
// remove stream on click
streamsEl.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLElement || event.target instanceof SVGElement)) {
        return
    }
    const button = event.target.closest("button[name=removeStream]")
    if (button !== null) {
        const streamRow: HTMLElement | null = button.closest(".stream-container")
        if (!streamRow) {
            return
        }
        removeStreamByHtmlRow(streamRow)
    }
})

loadState()
updateFlatpickr.call(flatpickrInstance)
updateThemeButton()
updatePreview()
