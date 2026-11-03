import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import * as Clipboard from 'expo-clipboard';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleCopy = async () => {
    const { error, errorInfo } = this.state;
    const errorText = `Error: ${error?.message || 'Unknown error'}\n\nStack:\n${error?.stack || 'No stack trace'}\n\nComponent Stack:\n${errorInfo?.componentStack || 'No component stack'}`;
    await Clipboard.setStringAsync(errorText);
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      const errorText = `${error?.message || 'Unknown error'}\n\n${error?.stack || ''}${errorInfo?.componentStack || ''}`;

      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>App Error</Text>
            <Text style={styles.subtitle}>Something went wrong</Text>
          </View>

          <ScrollView style={styles.errorContainer}>
            <Text style={styles.errorText} selectable>
              {errorText}
            </Text>
          </ScrollView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={this.handleCopy}>
              <Text style={styles.buttonText}>Copy Error</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    padding: 20,
    backgroundColor: '#d32f2f',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#ffebee',
  },
  errorContainer: {
    flex: 1,
    padding: 16,
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#fff',
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    backgroundColor: '#424242',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#2196F3',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
