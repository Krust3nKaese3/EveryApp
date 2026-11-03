import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Permission } from '../types';

interface PermissionRequestModalProps {
  visible: boolean;
  appName: string;
  requestedPermissions: Permission[];
  onGrant: () => void;
  onDeny: () => void;
}

const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  storage: 'Store data locally on your device',
  http: 'Make network requests to external servers',
  bluetooth: 'Scan and connect to Bluetooth devices',
  net: 'Raw local network (TCP/UDP sockets, e.g. Tuya lamps on port 6668)',
  ble: 'Bluetooth Low Energy (GATT): scan, connect, read/write devices like LED strips',
  notifications: 'Send you notifications',
  camera: 'Access your camera',
  sensors: 'Access accelerometer and gyroscope',
  vibration: 'Use device vibration',
  background: 'Run in the background when app is closed',
};

export const PermissionRequestModal: React.FC<PermissionRequestModalProps> = ({
  visible,
  appName,
  requestedPermissions,
  onGrant,
  onDeny,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDeny}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Permission Request</Text>
          <Text style={styles.appName}>{appName}</Text>
          <Text style={styles.description}>
            This mini-app requests the following permissions:
          </Text>
          
          <ScrollView style={styles.permissionList}>
            {requestedPermissions.map((permission) => (
              <View key={permission} style={styles.permissionItem}>
                <Text style={styles.permissionIcon}>✓</Text>
                <View style={styles.permissionText}>
                  <Text style={styles.permissionName}>{permission.toUpperCase()}</Text>
                  <Text style={styles.permissionDesc}>
                    {PERMISSION_DESCRIPTIONS[permission]}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.denyButton} onPress={onDeny}>
              <Text style={styles.denyButtonText}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.grantButton} onPress={onGrant}>
              <Text style={styles.grantButtonText}>Allow</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxHeight: '80%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  appName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#333',
    marginBottom: 16,
  },
  permissionList: {
    maxHeight: 300,
  },
  permissionItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  permissionIcon: {
    fontSize: 20,
    marginRight: 12,
    color: '#4CAF50',
  },
  permissionText: {
    flex: 1,
  },
  permissionName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  permissionDesc: {
    fontSize: 12,
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  denyButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  denyButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  grantButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  grantButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
