import React, { useState, useEffect, useRef } from 'react';
import { ScrollView,  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert  } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { GeminiService } from '@/services/gemini';
import { logger } from '@/utils/logger';

interface ChatMessage {
  id: string;
  text: string;
  isBot: boolean;
  role: 'user' | 'model';
  timestamp: string;
}

export default function AdminChatIA() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: '¡Hola! Soy tu Analista de IA. Estoy conectado a la base de datos de tu empresa (Ventas, Gastos, Personal y Vehículos). ¿Qué información te gustaría consultar hoy?',
      isBot: true,
      role: 'model',
      timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [dbContext, setDbContext] = useState<any>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);

  // Cargar contexto de la DB al montar (Inttec + Daravisa)
  useEffect(() => {
    const fetchContext = async () => {
      try {
        setIsLoadingContext(true);

        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/chat-ia/context`, { headers });
        if (!res.ok) {
          throw new Error('Error en API chat-ia/context');
        }
        
        const data = await res.json();
        
        logger.info('[ChatIA] Contexto cargado con éxito:', {
          gastos_activa: data.context?.datos_empresa_actual_autenticada?.gastos?.length || 0,
          ventas_activa: data.context?.datos_empresa_actual_autenticada?.ventas?.length || 0,
          usuarios_activa: data.context?.datos_empresa_actual_autenticada?.usuarios?.length || 0,
        });

        setDbContext(data.context);
      } catch (err) {
        logger.error('Error fetching full chat context:', err);
        Alert.alert('Advertencia', 'No se pudieron cargar todos los módulos de la base de datos.');
      } finally {
        setIsLoadingContext(false);
      }
    };

    fetchContext();
  }, []);

  const handleSend = async () => {
    if (!inputText.trim() || isTyping) return;
    
    const userText = inputText.trim();
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text: userText,
      isBot: false,
      role: 'user',
      timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    
    // Guardar el historial para enviarlo a Gemini (excluyendo el msj actual y mensajes sin rol claro) limitándolo a los últimos 6 mensajes
    const historyToPass = messages.slice(-6).map(m => ({ role: m.role, text: m.text }));
    
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    
    // Auto-scroll al final
    setTimeout(() => (flatListRef.current as any)?.scrollToEnd?.({ animated: true }), 100);

    try {
      if (!dbContext) {
        throw new Error("El contexto de la base de datos aún no se ha cargado.");
      }

      const responseText = await GeminiService.chatWithContext(userText, dbContext, historyToPass);
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: responseText,
        isBot: true,
        role: 'model',
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: `Error de conexión: ${err.message}`,
        isBot: true,
        role: 'model',
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => (flatListRef.current as any)?.scrollToEnd?.({ animated: true }), 100);
    }
  };

  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        
        <View style={styles.headerTitleContainer}>
          <Ionicons name="sparkles" size={20} color="#8b5cf6" />
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Asistente de IA</Text>
            <Text style={{ fontSize: 10, color: themeColors.textSecondary, textAlign: 'center' }}>
              {isLoadingContext ? 'Sincronizando DB...' : 'Conectado a DB'}
            </Text>
          </View>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 80}
      >
        {/* Chat Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatContainer}
          onContentSizeChange={() => (flatListRef.current as any)?.scrollToEnd?.({ animated: true })}
          renderItem={({ item }) => (
            <View style={[
              styles.messageWrapper,
              item.isBot ? styles.messageWrapperBot : styles.messageWrapperUser
            ]}>
              {item.isBot && (
                <View style={[styles.botAvatar, { backgroundColor: '#8b5cf6' }]}>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                </View>
              )}
              <View style={[
                styles.messageBubble,
                item.isBot 
                  ? { backgroundColor: themeColors.backgroundElement, borderBottomLeftRadius: 4 }
                  : { backgroundColor: '#8b5cf6', borderBottomRightRadius: 4 }
              ]}>
                {item.isBot ? (
                  <View>
                    {item.text.split('\n').map((line, i) => {
                      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
                      const cleanedLine = isBullet ? line.trim().substring(2) : line;
                      const parts = cleanedLine.split(/(\*\*.*?\*\*)/g);
                      
                      return (
                        <View key={i} style={isBullet ? { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 } : { marginTop: 2 }}>
                          {isBullet && <Text style={[styles.messageText, { color: themeColors.text, marginRight: 6 }]}>•</Text>}
                          <Text style={[styles.messageText, { color: themeColors.text }, isBullet && { flex: 1 }]}>
                            {parts.map((part, j) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                return <Text key={j} style={{ fontWeight: 'bold' }}>{part.slice(2, -2)}</Text>;
                              }
                              return <Text key={j}>{part}</Text>;
                            })}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[styles.messageText, { color: '#fff' }]}>
                    {item.text}
                  </Text>
                )}
                <Text style={[
                  styles.timestamp,
                  { color: item.isBot ? themeColors.textSecondary : 'rgba(255,255,255,0.7)' }
                ]}>
                  {item.timestamp}
                </Text>
              </View>
            </View>
          )}
        />

        {isTyping && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color="#8b5cf6" />
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginLeft: 8 }}>Analizando datos...</Text>
          </View>
        )}

        {/* Input Area */}
        <View style={[styles.inputContainer, { backgroundColor: themeColors.backgroundElement, borderTopColor: themeColors.border }]}>
          <TextInput
            style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.background }]}
            placeholder={isLoadingContext ? "Sincronizando..." : "Escribe tu pregunta..."}
            placeholderTextColor={themeColors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            onKeyPress={handleKeyPress}
            editable={!isLoadingContext}
          />
          <TouchableOpacity 
            onPress={handleSend}
            style={[
              styles.sendButton,
              { backgroundColor: (inputText.trim() && !isTyping && !isLoadingContext) ? '#8b5cf6' : themeColors.border }
            ]}
            disabled={!inputText.trim() || isTyping || isLoadingContext}
          >
            {isTyping ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.one,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  chatContainer: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: Spacing.two,
    maxWidth: '85%',
  },
  messageWrapperBot: {
    alignSelf: 'flex-start',
  },
  messageWrapperUser: {
    alignSelf: 'flex-end',
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.two,
    marginTop: 4,
  },
  messageBubble: {
    padding: Spacing.three,
    borderRadius: BorderRadius.large,
    flexShrink: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.six,
    paddingBottom: Spacing.two,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.three,
    borderTopWidth: 1,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: Spacing.four,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});


