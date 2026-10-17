import { addDays } from "date-fns";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppData, ExternalGoogleEvent } from "@/lib/domain";
import { AgendaView, CalendarGrid, MonthView } from "./calendar-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const days = Array.from({ length: 7 }, (_, index) =>
  addDays(new Date("2026-10-12T12:00:00Z"), index),
);

function allDay(
  id: string,
  startDate: string,
  endDate: string,
): ExternalGoogleEvent {
  return {
    id,
    title: id,
    startDate,
    endDate,
    allDay: true,
    visible: true,
    status: "confirmed",
    transparency: "opaque",
    color: "#6F8FEF",
    readOnly: true,
    blocksTime: false,
  };
}

const data = {
  teacher: { subscription: { readOnly: false } },
  students: [],
  groups: [],
  lessons: [],
  availability: [],
  availabilityExceptions: [],
  calendarBlocks: [],
  calendarBookings: [],
  externalGoogleEvents: [
    allDay("conference", "2026-10-13", "2026-10-17"),
    allDay("materials", "2026-10-14", "2026-10-15"),
    allDay("planning", "2026-10-14", "2026-10-16"),
    allDay("admin", "2026-10-14", "2026-10-15"),
  ],
  integrations: { google: { status: "connected" } },
} as unknown as AppData;

describe("all-day events in existing calendar views", () => {
  it("renders a spanning week lane outside the hourly columns with overflow", () => {
    const html = renderToStaticMarkup(
      <CalendarGrid
        days={days}
        lessons={[]}
        data={data}
        timezone="Europe/Warsaw"
        planning={false}
        onSlot={() => undefined}
        dragged={null}
        onDrag={() => undefined}
        onDrop={() => undefined}
        selectedRange={null}
        onRangeSelect={() => undefined}
        readOnly={false}
        onDragEnd={() => undefined}
        onDeleteBlock={() => undefined}
        onInspect={() => undefined}
        onInspectExternal={() => undefined}
      />,
    );
    expect(html).toContain("calendar-all-day-lane");
    expect(html).toContain("grid-column:2 / span 4");
    expect(html).toContain("+2 więcej");
    expect(html.indexOf("calendar-all-day-lane")).toBeLessThan(
      html.indexOf("calendar-columns"),
    );
  });

  it("renders month continuation labels and a bounded +N control", () => {
    const html = renderToStaticMarkup(
      <MonthView
        anchor={new Date("2026-10-14T12:00:00Z")}
        data={data}
        timezone="Europe/Warsaw"
        onDay={() => undefined}
        onInspectExternal={() => undefined}
      />,
    );
    expect(html).toContain("month-google-event--middle");
    expect(html).toContain("+1 więcej");
  });

  it("renders an agenda all-day section before timed rows", () => {
    const agendaData = {
      ...data,
      externalGoogleEvents: [
        ...data.externalGoogleEvents,
        {
          id: "timed",
          title: "Timed",
          startsAt: "2026-10-14T11:00:00Z",
          endsAt: "2026-10-14T12:00:00Z",
          allDay: false,
          visible: true,
          status: "confirmed",
          transparency: "opaque",
          color: "#C75B39",
          readOnly: true,
          blocksTime: true,
        },
      ],
    } as AppData;
    const html = renderToStaticMarkup(
      <AgendaView
        days={[days[2]]}
        data={agendaData}
        timezone="Europe/Warsaw"
        openLessonComposer={() => undefined}
        onDeleteBlock={() => undefined}
        onInspect={() => undefined}
        onInspectExternal={() => undefined}
      />,
    );
    expect(html).toContain("agenda-all-day");
    expect(html.indexOf("agenda-all-day")).toBeLessThan(
      html.indexOf("agenda-event-row--external"),
    );
  });
});
