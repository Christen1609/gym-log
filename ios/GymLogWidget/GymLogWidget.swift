import WidgetKit
import SwiftUI

private let appGroup = "group.com.christen1609.gymlog"

struct GymEntry: TimelineEntry {
    let date: Date
    let nextDay: String
    let daysSince: Int // -1 = no sessions yet
}

private func loadEntry() -> GymEntry {
    let defaults = UserDefaults(suiteName: appGroup)
    let next = defaults?.string(forKey: "nextDay") ?? ""
    let since = defaults?.object(forKey: "daysSince") as? Int ?? -1
    return GymEntry(date: Date(), nextDay: next, daysSince: since)
}

struct GymProvider: TimelineProvider {
    func placeholder(in context: Context) -> GymEntry {
        GymEntry(date: Date(), nextDay: "Push", daysSince: 1)
    }

    func getSnapshot(in context: Context, completion: @escaping (GymEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GymEntry>) -> Void) {
        let entry = loadEntry()
        let refresh = Calendar.current.date(byAdding: .hour, value: 6, to: entry.date) ?? entry.date.addingTimeInterval(21600)
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }
}

private func sinceText(_ days: Int) -> String {
    if days < 0 { return "No sessions yet" }
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
