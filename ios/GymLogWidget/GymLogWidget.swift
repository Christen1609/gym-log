import WidgetKit
import SwiftUI

private let appGroup = "group.com.christen1609.gymlog"

struct GymEntry: TimelineEntry {
    let date: Date
    let nextDay: String
    let lastTrainingISO: String // "YYYY-MM-DD", or "" = no sessions yet

    /// Whole local calendar days between the last training day and this entry's date; nil = none.
    var daysSince: Int? {
        let parts = lastTrainingISO.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let calendar = Calendar.current
        var comps = DateComponents()
        comps.year = parts[0]
        comps.month = parts[1]
        comps.day = parts[2]
        guard let last = calendar.date(from: comps) else { return nil }
        let from = calendar.startOfDay(for: last)
        let to = calendar.startOfDay(for: date)
        guard let days = calendar.dateComponents([.day], from: from, to: to).day else { return nil }
        return max(days, 0)
    }
}

private func loadValues() -> (nextDay: String, lastTrainingISO: String) {
    let defaults = UserDefaults(suiteName: appGroup)
    return (
        defaults?.string(forKey: "nextDay") ?? "",
        defaults?.string(forKey: "lastTrainingISO") ?? ""
    )
}

struct GymProvider: TimelineProvider {
    func placeholder(in context: Context) -> GymEntry {
        let today = Calendar.current.startOfDay(for: Date())
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today) ?? today
        let f = DateFormatter()
        f.calendar = Calendar.current
        f.dateFormat = "yyyy-MM-dd"
        return GymEntry(date: Date(), nextDay: "Push", lastTrainingISO: f.string(from: yesterday))
    }

    func getSnapshot(in context: Context, completion: @escaping (GymEntry) -> Void) {
        let v = loadValues()
        completion(GymEntry(date: Date(), nextDay: v.nextDay, lastTrainingISO: v.lastTrainingISO))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GymEntry>) -> Void) {
        let v = loadValues()
        let calendar = Calendar.current
        let now = Date()
        // One entry now, then one at each of the next three local midnights, so the
        // "days since" text rolls over on its own even if the app is not opened.
        var entries = [GymEntry(date: now, nextDay: v.nextDay, lastTrainingISO: v.lastTrainingISO)]
        let todayStart = calendar.startOfDay(for: now)
        for offset in 1...3 {
            if let midnight = calendar.date(byAdding: .day, value: offset, to: todayStart) {
                entries.append(GymEntry(date: midnight, nextDay: v.nextDay, lastTrainingISO: v.lastTrainingISO))
            }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

private func sinceText(_ days: Int?) -> String {
    guard let days = days else { return "No sessions yet" }
    if days == 0 { return "Trained today" }
    if days == 1 { return "1 day since training" }
    return "\(days) days since training"
}

struct GymLogWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: GymEntry

    private var nextText: String {
        entry.nextDay.isEmpty ? "Next: -" : "Next: \(entry.nextDay)"
    }

    var body: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(nextText).font(.headline)
                Text(sinceText(entry.daysSince)).font(.caption)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 6) {
                Text("Gym Log").font(.caption).foregroundColor(.secondary)
                Text(nextText).font(.title3).bold().minimumScaleFactor(0.6)
                Text(sinceText(entry.daysSince)).font(.footnote).foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding()
        }
    }
}

struct GymLogWidget: Widget {
    let kind = "GymLogWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymProvider()) { entry in
            if #available(iOS 17.0, *) {
                GymLogWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                GymLogWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Gym Log")
        .description("Your next session and days since you last trained.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

@main
struct GymLogWidgetBundle: WidgetBundle {
    var body: some Widget {
        GymLogWidget()
    }
}
