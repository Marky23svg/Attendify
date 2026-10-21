import { useEffect, useState } from 'react';
import { Animated, Dimensions, Image, StyleSheet, View } from 'react-native';

export const SPLASH_BACKGROUND = '#0055FF';

const RING_RADII = [200, 300, 410, 530];
const RING_OPACITIES = [0.18, 0.12, 0.08, 0.05];
const RING_CENTER_X_RATIO = 0.9;
const LOGO_SIZE = 140;
const LOGO_ENTER_DURATION = 600;
const FADE_OUT_DURATION = 250;

type SplashOverlayProps = {
  visible: boolean;
  onHidden?: () => void;
};

export function SplashOverlay({ visible, onHidden }: SplashOverlayProps) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [logo] = useState(() => new Animated.Value(0));

  const { width, height } = Dimensions.get('window');
  const centerX = width * RING_CENTER_X_RATIO;
  const centerY = height * 0.5;

  useEffect(() => {
    Animated.timing(logo, {
      toValue: 1,
      duration: LOGO_ENTER_DURATION,
      useNativeDriver: true,
    }).start();
  }, [logo]);

  useEffect(() => {
    if (visible) return;

    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onHidden?.();
    });
  }, [onHidden, opacity, visible]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.background, { opacity }]}
      >
        {RING_RADII.map((radius, index) => (
          <View
            key={radius}
            style={[
              styles.ring,
              {
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
                left: centerX - radius,
                top: centerY - radius,
                opacity: RING_OPACITIES[index],
              },
            ]}
          />
        ))}

        <Animated.View
          style={[
            styles.logo,
            {
              opacity: logo,
              transform: [
                {
                  scale: logo.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Image
            source={require('@/assets/images/Attendify-logo-white.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: SPLASH_BACKGROUND,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  logo: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    left: '50%',
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    marginLeft: -LOGO_SIZE / 2,
    marginTop: -LOGO_SIZE / 2,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});
