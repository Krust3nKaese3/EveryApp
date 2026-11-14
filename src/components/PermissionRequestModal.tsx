import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Permission } from '../types';
import { PERMISSION_INFO } from '../bridge/permissionInfo';

interface PermissionRequestModalProps {
  visible: boolean;
  appName: string;
  requestedPermissions: Permission[];
  onGrant: () => void;
  onDeny: () => void;
  title?: string;
  intro?: string;
  grantLabel?: string;
  denyLabel?: string;
}

export const PermissionRequestModal: React.FC<PermissionRequestModalProps> = ({
  visible,
  appName,
  requestedPermissions,
  onGrant,
  onDeny,
  title = 'Berechtigungen',
  intro = 'Diese Mini-App möchte folgende Gerätefunktionen nutzen. Ohne Zustimmung bleibt der Zugriff aus. Du kannst jede Berechtigung später in den App-Infos widerrufen.',
  grantLabel = 'Erlauben',
  denyLabel = 'Ablehnen',
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
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.appName}>{appName}</Text>
          <Text style={styles.description}>{intro}</Text>
          
          <ScrollView style={styles.permissionList}>
            {requestedPermissions.map((permission) => (
              <View key={permission} style={styles.permissionItem}>
                <Text style={styles.permissionIcon}>✓</Text>
                <View style={styles.permissionText}>
                  <Text style={styles.permissionName}>{PERMISSION_INFO[permission]?.title || permission}</Text>
                  <Text style={styles.permissionDesc}>
                    {PERMISSION_INFO[permission]?.description || permission}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.denyButton} onPress={onDeny}>
              <Text style={styles.denyButtonText}>{denyLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.grantButton} onPress={onGrant}>
              <Text style={styles.grantButtonText}>{grantLabel}</Text>
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
