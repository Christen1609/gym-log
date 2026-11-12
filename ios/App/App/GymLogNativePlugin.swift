import Foundation
import Capacitor
import HealthKit
import WidgetKit

@objc(GymLogNativePlugin)
public class GymLogNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GymLogNativePlugin"
    public let jsName = "GymLogNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(#selector(requestHealth(_:)), returnType: .promise),
        CAPPluginMethod(#selector(saveWorkout(_:)), returnType: .promise),
        CAPPluginMethod(#selector(setWidgetData(_:)), returnType: .promise)
    ]

    private let healthStore = HKHealthStore()
    private let appGroup = "group.com.christen1609.gymlog"

    // MARK: - HealthKit

    private var shareTypes: Set<HKSampleType> {
        return [HKObjectType.workoutType(), HKQuantityType(.distanceWalkingRunning)]
    }

    @objc func requestHealth(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        healthStore.requestAuthorization(toShare: shareTypes, read: []) { [weak self] success, error in
            guard let self = self else { return }
            if let error = error {
                call.reject("Health authorization failed: \(error.localizedDescription)")
                return
            }
            let status = self.healthStore.authorizationStatus(for: HKObjectType.workoutType())
            call.resolve(["granted": success && status == .sharingAuthorized])
        }
    }

    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device")
            return
        }
        guard let kind = call.getString("kind"), kind == "strength" || kind == "cardio" else {
            call.reject("kind must be \"strength\" or \"cardio\"")
            return
        }
        guard let startMs = call.getDouble("start"), let endMs = call.getDouble("end") else {
            call.reject("start and end (epoch milliseconds) are required")
            return
        }
        guard endMs > startMs else {
            call.reject("end must be after start")
            return
        }
        let start = Date(timeIntervalSince1970: startMs / 1000.0)
        let end = Date(timeIntervalSince1970: endMs / 1000.0)
        let distanceKm = call.getDouble("distanceKm")
        let cardioKind = (call.getString("cardioKind") ?? "").lowercased()

        let activity: HKWorkoutActivityType
        var countsDistance = false
        if kind == "strength" {
            activity = .traditionalStrengthTraining
        } else {
            switch cardioKind {
            case "run", "treadmill":
                activity = .running
                countsDistance = true
            case "walk":
                activity = .walking
                countsDistance = true
            case "bike", "cycle":
                activity = .cycling
            case "row":
                activity = .rowing
            default:
                activity = .other
            }
        }

        guard healthStore.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else {
            call.reject("Gym Log is not allowed to save workouts to Apple Health")
            return
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = activity
        let builder = HKWorkoutBuilder(healthStore: healthStore, configuration: configuration, device: .local())

        builder.beginCollection(withStart: start) { _, error in
            if let error = error {
                call.reject("Could not start workout: \(error.localizedDescription)")
                return
            }

            let finish = {
                builder.endCollection(withEnd: end) { _, error in
                    if let error = error {
                        call.reject("Could not end workout: \(error.localizedDescription)")
                        return
                    }
                    builder.finishWorkout { workout, error in
                        if let error = error {
                            call.reject("Could not save workout: \(error.localizedDescription)")
                        } else if workout == nil {
                            call.reject("Could not save workout")
                        } else {
                            call.resolve()
                        }
                    }
                }
            }

            if countsDistance, let km = distanceKm, km > 0,
               self.healthStore.authorizationStatus(for: HKQuantityType(.distanceWalkingRunning)) == .sharingAuthorized {
                let quantity = HKQuantity(unit: .meter(), doubleValue: km * 1000.0)
                let sample = HKQuantitySample(
                    type: HKQuantityType(.distanceWalkingRunning),
                    quantity: quantity,
                    start: start,
                    end: end
                )
                builder.add([sample]) { _, error in
                    if let error = error {
                        call.reject("Could not add distance: \(error.localizedDescription)")
                        return
                    }
                    finish()
                }
            } else {
                finish()
            }
        }
    }

    // MARK: - Widget

    @objc func setWidgetData(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            call.reject("App Group is not available")
            return
        }
        defaults.set(call.getString("nextDay") ?? "", forKey: "nextDay")
        defaults.set(call.getInt("daysSince") ?? -1, forKey: "daysSince")
        defaults.set(Date().timeIntervalSince1970, forKey: "updatedAt")
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
