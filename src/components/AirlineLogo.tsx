import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { airlineColor, airlineInitials } from '../utils/format';

// Real airline domain per IATA code, used to fetch that airline's own site icon — this avoids the
// wrong-logo problem some third-party airline-logo CDNs have for less-common carriers (confirmed:
// Kiwi.com's CDN served its own placeholder "K" mark for Southwest instead of a real logo).
const AIRLINE_DOMAINS: Record<string, string> = {
  DL: 'delta.com',
  UA: 'united.com',
  AA: 'aa.com',
  WN: 'southwest.com',
};

function logoUrlFor(airlineCode: string): string | null {
  const domain = AIRLINE_DOMAINS[airlineCode.toUpperCase()];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

export function AirlineLogo({
  airlineCode,
  airlineName,
  size = 36,
}: {
  airlineCode: string | null;
  airlineName: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };
  const logoUrl = airlineCode ? logoUrlFor(airlineCode) : null;

  if (!logoUrl || failed) {
    return (
      <View style={[styles.fallback, dimensionStyle, { backgroundColor: airlineColor(airlineCode) }]}>
        <Text style={[styles.fallbackText, { fontSize: size * 0.32 }]}>{airlineInitials(airlineName)}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.logoContainer, dimensionStyle]}>
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size * 0.7, height: size * 0.7 }}
        contentFit="contain"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoContainer: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#fff', fontWeight: '700' },
});
