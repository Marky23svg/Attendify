import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Login failed', error.message);
      return;
    }

    if (data.session) {
      router.replace('/(tabs)/home');
    }
  };

  return (
    <View className="flex-1 bg-[#F5F7FB]">
      <StatusBar barStyle="dark-content" />

      {/* Decorative background circles */}
      <View
        className="absolute rounded-full"
        style={{
          width: 280,
          height: 280,
          backgroundColor: '#0066FF',
          opacity: 0.06,
          top: -100,
          right: -100,
        }}
      />
      <View
        className="absolute rounded-full"
        style={{
          width: 220,
          height: 220,
          backgroundColor: '#0066FF',
          opacity: 0.05,
          top: 180,
          left: -110,
        }}
      />
      <View
        className="absolute rounded-full"
        style={{
          width: 160,
          height: 160,
          backgroundColor: '#F45B69',
          opacity: 0.05,
          bottom: 120,
          right: -70,
        }}
      />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-1 justify-center px-6 py-8">

              {/* Logo */}
              <View className="items-center mb-10">
                <View
                  className="w-24 h-24 rounded-3xl items-center justify-center mb-2 overflow-hidden"
                  style={{
                    backgroundColor: '#0066FF',
                    shadowColor: '#0066FF',
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.3,
                    shadowRadius: 20,
                    elevation: 8,
                  }}
                >
                  <Image
                    source={require('../../assets/images/Attendify-logo-white.png')}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>

                <Text className="text-[#0066FF] text-3xl font-bold tracking-tight">
                  Attendify
                </Text>
              </View>

              {/* Form Card */}
              <View
                className="bg-white rounded-3xl p-6 -mt-8"
                style={{
                  shadowColor: '#0F1E36',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.08,
                  shadowRadius: 20,
                  elevation: 4,
                }}
              >
                {/* Welcome Text */}
                <View className="mb-6">
                  <Text className="text-gray-900 text-xl font-bold">
                    Welcome back
                  </Text>
                  <Text className="text-gray-500 text-sm mt-1">
                    Sign in to continue
                  </Text>
                </View>

                {/* Email Input */}
                <View className="mb-4">
                  <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                    Email
                  </Text>
                  <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5]">
                    <Mail size={18} color="#9CA3AF" />
                    <TextInput
                      className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                      placeholder="you@company.com"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={email}
                      onChangeText={setEmail}
                      editable={!loading}
                    />
                  </View>
                </View>

                {/* Password Input */}
                <View className="mb-6">
                  <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                    Password
                  </Text>
                  <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5]">
                    <Lock size={18} color="#9CA3AF" />
                    <TextInput
                      className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                      placeholder="Enter your password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      editable={!loading}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color="#9CA3AF" />
                      ) : (
                        <Eye size={18} color="#9CA3AF" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Login Button */}
                <TouchableOpacity
                  className="rounded-2xl py-4 flex-row items-center justify-center"
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: loading ? '#93C5FD' : '#0066FF',
                    shadowColor: '#0066FF',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: loading ? 0 : 0.3,
                    shadowRadius: 16,
                    elevation: loading ? 0 : 8,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Text className="text-white font-bold text-base">
                        Log In
                      </Text>
                      <ArrowRight
                        size={18}
                        color="white"
                        style={{ marginLeft: 8 }}
                      />
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View className="items-center mt-8">
                <Text className="text-gray-500 text-sm text-center">
                  Don't have an account?{'\n'}
                  Contact your HR admin.
                </Text>
              </View>

              {/* Bottom tagline */}
              <Text className="text-gray-400 text-xs text-center mt-6">
                Attendify • Version 1.0.0
              </Text>

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}