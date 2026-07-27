package id.createimpact.kasirku

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.Build
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.PermissionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID

// Standard Serial Port Profile UUID — essentially every cheap ESC/POS
// Bluetooth thermal printer advertises this.
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
private const val BLUETOOTH_ALIAS = "bluetooth"

// Mirrors print-agent/src/printSocket.ts's sendToPrinter almost 1:1 for the
// LAN path — same connect+write+close shape and error vocabulary, so
// dispatch-print-jobs.ts can treat this and the print-agent HTTP path the
// same way. The Bluetooth path only ever reads *paired* devices
// (bluetoothAdapter.bondedDevices) — it never calls startDiscovery(), which
// is what lets this whole plugin skip ACCESS_FINE_LOCATION entirely: the
// cashier pairs the printer once via Android's own Bluetooth settings, and
// this plugin just reads what's already bonded.
@CapacitorPlugin(
    name = "KitchenPrinter",
    permissions = [Permission(strings = [android.Manifest.permission.BLUETOOTH_CONNECT], alias = BLUETOOTH_ALIAS)],
)
class KitchenPrinterPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.IO)

    @PluginMethod
    fun printLan(call: PluginCall) {
        val ip = call.getString("ip")
        val port = call.getInt("port")
        val bytesBase64 = call.getString("bytesBase64")
        val timeoutMs = call.getInt("timeoutMs", 3000) ?: 3000

        if (ip.isNullOrEmpty() || port == null || bytesBase64.isNullOrEmpty()) {
            call.reject("missing_ip_port_or_bytes")
            return
        }

        scope.launch {
            val result = try {
                withContext(Dispatchers.IO) {
                    val bytes = Base64.decode(bytesBase64, Base64.DEFAULT)
                    Socket().use { socket ->
                        socket.connect(InetSocketAddress(ip, port), timeoutMs)
                        socket.getOutputStream().apply {
                            write(bytes)
                            flush()
                        }
                    }
                }
                JSObject().put("ok", true)
            } catch (e: java.net.SocketTimeoutException) {
                JSObject().put("ok", false).put("error", "connect_timeout")
            } catch (e: IOException) {
                JSObject().put("ok", false).put("error", e.message ?: "io_error")
            } catch (e: Exception) {
                JSObject().put("ok", false).put("error", e.message ?: "unknown_error")
            }
            call.resolve(result)
        }
    }

    private fun needsBluetoothPermission(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState(BLUETOOTH_ALIAS) != PermissionState.GRANTED

    private fun getBluetoothAdapter(): BluetoothAdapter? {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }

    @PluginMethod
    fun isBluetoothEnabled(call: PluginCall) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias(BLUETOOTH_ALIAS, call, "bluetoothStatusPermCallback")
            return
        }
        resolveBluetoothStatus(call)
    }

    @SuppressLint("MissingPermission") // manually gated by needsBluetoothPermission() above
    private fun resolveBluetoothStatus(call: PluginCall) {
        val adapter = getBluetoothAdapter()
        if (adapter == null) {
            call.resolve(JSObject().put("enabled", false).put("supported", false))
            return
        }
        call.resolve(JSObject().put("enabled", adapter.isEnabled).put("supported", true))
    }

    @PluginMethod
    fun listPairedBluetoothDevices(call: PluginCall) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias(BLUETOOTH_ALIAS, call, "listDevicesPermCallback")
            return
        }
        resolvePairedDevices(call)
    }

    @SuppressLint("MissingPermission") // manually gated by needsBluetoothPermission() above
    private fun resolvePairedDevices(call: PluginCall) {
        val adapter = getBluetoothAdapter()
        val devices = JSArray()
        if (adapter != null && adapter.isEnabled) {
            adapter.bondedDevices.forEach { device ->
                devices.put(JSObject().put("name", device.name ?: device.address).put("address", device.address))
            }
        }
        call.resolve(JSObject().put("devices", devices))
    }

    @PluginMethod
    fun printBluetooth(call: PluginCall) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias(BLUETOOTH_ALIAS, call, "printBluetoothPermCallback")
            return
        }
        performBluetoothPrint(call)
    }

    @SuppressLint("MissingPermission") // manually gated by needsBluetoothPermission() above
    private fun performBluetoothPrint(call: PluginCall) {
        val address = call.getString("address")
        val bytesBase64 = call.getString("bytesBase64")

        if (address.isNullOrEmpty() || bytesBase64.isNullOrEmpty()) {
            call.reject("missing_address_or_bytes")
            return
        }

        scope.launch {
            val result = try {
                withContext(Dispatchers.IO) {
                    val adapter = getBluetoothAdapter() ?: error("bluetooth_not_supported")
                    if (!adapter.isEnabled) error("bluetooth_disabled")
                    val device = adapter.getRemoteDevice(address)
                    val bytes = Base64.decode(bytesBase64, Base64.DEFAULT)

                    // No cancelDiscovery() here on purpose — it requires
                    // BLUETOOTH_SCAN on Android 12+, and this plugin never
                    // calls startDiscovery() in the first place (that's what
                    // lets it skip the location permission entirely), so
                    // there's never an active discovery to cancel.

                    // Some printer Bluetooth stacks reject the secure RFCOMM
                    // socket and only work insecure — try secure first, fall
                    // back automatically rather than making the cashier guess.
                    val socket: BluetoothSocket = try {
                        device.createRfcommSocketToServiceRecord(SPP_UUID).also { it.connect() }
                    } catch (secureFailure: IOException) {
                        device.createInsecureRfcommSocketToServiceRecord(SPP_UUID).also { it.connect() }
                    }

                    socket.use {
                        it.outputStream.apply {
                            write(bytes)
                            flush()
                        }
                    }
                }
                JSObject().put("ok", true)
            } catch (e: IOException) {
                JSObject().put("ok", false).put("error", e.message ?: "io_error")
            } catch (e: Exception) {
                JSObject().put("ok", false).put("error", e.message ?: "unknown_error")
            }
            call.resolve(result)
        }
    }

    @PermissionCallback
    private fun bluetoothStatusPermCallback(call: PluginCall) {
        if (getPermissionState(BLUETOOTH_ALIAS) == PermissionState.GRANTED) {
            resolveBluetoothStatus(call)
        } else {
            call.resolve(JSObject().put("enabled", false).put("supported", true))
        }
    }

    @PermissionCallback
    private fun listDevicesPermCallback(call: PluginCall) {
        if (getPermissionState(BLUETOOTH_ALIAS) == PermissionState.GRANTED) {
            resolvePairedDevices(call)
        } else {
            call.resolve(JSObject().put("devices", JSArray()))
        }
    }

    @PermissionCallback
    private fun printBluetoothPermCallback(call: PluginCall) {
        if (getPermissionState(BLUETOOTH_ALIAS) == PermissionState.GRANTED) {
            performBluetoothPrint(call)
        } else {
            call.resolve(JSObject().put("ok", false).put("error", "bluetooth_permission_denied"))
        }
    }
}
