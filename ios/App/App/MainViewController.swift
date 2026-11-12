import UIKit
import Capacitor

/// Capacitor bridge view controller that also registers the app's local plugin.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GymLogNativePlugin())
    }
}
