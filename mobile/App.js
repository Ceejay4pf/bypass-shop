import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* The live Bypass Shop web app. Change this if the Vercel URL ever changes. */
const APP_URL = "https://bypass-shop.vercel.app";
const LOCK_KEY = "bp_biometric_on"; // per-device opt-in flag

export default function App() {
  const webRef = useRef(null);
  const canGoBack = useRef(false);

  const [loading, setLoading] = useState(true);
  const [hasHardware, setHasHardware] = useState(false);
  const [lockOn, setLockOn] = useState(false);   // did this user opt in?
  const [unlocked, setUnlocked] = useState(true); // gate state
  const [ready, setReady] = useState(false);      // finished reading prefs

  // On launch: check the device supports biometrics and read the opt-in flag.
  useEffect(() => {
    (async () => {
      const [compatible, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      const supported = compatible && enrolled;
      setHasHardware(supported);
      const flag = (await AsyncStorage.getItem(LOCK_KEY)) === "1";
      const on = supported && flag;
      setLockOn(on);
      setUnlocked(!on); // if lock is on, start locked
      setReady(true);
    })();
  }, []);

  const authenticate = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Bypass Shop",
      fallbackLabel: "Use passcode",
    });
    if (res.success) setUnlocked(true);
  }, []);

  // Prompt automatically whenever we're locked.
  useEffect(() => {
    if (ready && lockOn && !unlocked) authenticate();
  }, [ready, lockOn, unlocked, authenticate]);

  // Re-lock when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && lockOn) setUnlocked(false);
    });
    return () => sub.remove();
  }, [lockOn]);

  // Android hardware back button navigates the web app, not out of it.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const toggleLock = async (value) => {
    if (value) {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirm to turn on unlock" });
      if (!res.success) return;
    }
    setLockOn(value);
    setUnlocked(true);
    await AsyncStorage.setItem(LOCK_KEY, value ? "1" : "0");
  };

  if (!ready) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // Locked gate — only when the user opted in and we're not unlocked yet.
  if (lockOn && !unlocked) {
    return (
      <SafeAreaView style={styles.lock}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.brand}>BYPASS SHOP</Text>
        <Pressable style={styles.fab} onPress={authenticate}>
          <Text style={styles.fabIcon}>🔒</Text>
        </Pressable>
        <Text style={styles.lockHint}>Tap to unlock with fingerprint / Face ID</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#2563EB" />
      <WebView
        ref={webRef}
        source={{ uri: APP_URL }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(nav) => { canGoBack.current = nav.canGoBack; }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        startInLoadingState
      />

      {/* Optional biometric opt-in — only shown on devices that support it. */}
      {hasHardware && (
        <View style={styles.lockBar}>
          <Text style={styles.lockBarText}>Biometric unlock</Text>
          <Switch value={lockOn} onValueChange={toggleLock} />
        </View>
      )}

      {loading && (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F5F8" },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F8",
  },
  lock: { flex: 1, backgroundColor: "#F3F5F8", alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 22, fontWeight: "800", letterSpacing: 2, color: "#1B2430", marginBottom: 32 },
  fab: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: "#2563EB",
    alignItems: "center", justifyContent: "center",
  },
  fabIcon: { fontSize: 40 },
  lockHint: { marginTop: 20, color: "#5A6472", fontSize: 14 },
  lockBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#FFFFFF",
    borderTopWidth: 1, borderTopColor: "#DEE3E9",
  },
  lockBarText: { fontSize: 13, fontWeight: "600", color: "#1B2430" },
});
