import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, inttecClient, daravisaClient } from '@/services/supabase';
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
  const flatListRef = useRef<FlatList>(null);

  // Cargar contexto de la DB al montar (Inttec + Daravisa)
  useEffect(() => {
    const fetchContext = async () => {
      try {
        setIsLoadingContext(true);

        const safeFetch = async (client: any, table: string) => {
          try {
            const { data, error } = await client.from(table).select('*').limit(200);
            if (error) {
              logger.warn(`[ChatIA] Error en tabla ${table}:`, error.message);
              return [];
            }
            return data || [];
          } catch (e: any) {
            logger.warn(`[ChatIA] Excepción en tabla ${table}:`, e?.message);
            return [];
          }
        };

        const fetchCompanyData = async (client: any, companyName: string) => {
          try {
            const [
              gastosData,
              ventasData,
              ventasPartidasData,
              usuariosData,
              asistenciasData,
              vehiculosData,
              gasolinaData,
              auditoriasData,
              clientesData
            ] = await Promise.all([
              safeFetch(client, 'gastos'),
              safeFetch(client, 'ventas'),
              safeFetch(client, 'ventas_partidas'),
              safeFetch(client, 'usuarios'),
              safeFetch(client, 'asistencias'),
              safeFetch(client, 'vehiculos'),
              safeFetch(client, 'registro_gasolina'),
              safeFetch(client, 'auditorias_tarjeta'),
              safeFetch(client, 'clientes')
            ]);

            const userMap: Record<string, string> = {};
            usuariosData.forEach((u: any) => { userMap[u.id] = u.nombre || u.email || 'Desconocido'; });

            const vehiculoMap: Record<string, string> = {};
            vehiculosData.forEach((v: any) => { vehiculoMap[v.id] = `${v.marca || ''} ${v.modelo || ''} (${v.placas || ''})`.trim(); });

            const gastos = gastosData.map((g: any) => ({
              ...g,
              empresa: companyName,
              empleado_nombre: userMap[g.empleado_id || g.usuario_id] || 'Desconocido'
            }));

            const asistencias = asistenciasData.map((a: any) => ({
              ...a,
              empresa: companyName,
              empleado_nombre: userMap[a.usuario_id || a.empleado_id] || 'Desconocido'
            }));

            const gasolina = gasolinaData.map((reg: any) => ({
              ...reg,
              empresa: companyName,
              empleado_nombre: userMap[reg.empleado_id || reg.usuario_id] || 'Desconocido',
              vehiculo_info: vehiculoMap[reg.vehiculo_id] || 'Desconocido'
            }));

            return {
              empresa: companyName,
              total_registros_gastos: gastos.length,
              total_registros_ventas: ventasData.length,
              usuarios: usuariosData.map((u: any) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, empresa: companyName })),
              gastos,
              ventas: ventasData.map((v: any) => ({ ...v, empresa: companyName })),
              ventas_partidas: ventasPartidasData,
              asistencias,
              vehiculos: vehiculosData.map((v: any) => ({ ...v, empresa: companyName })),
              registro_gasolina: gasolina,
              auditorias_tarjeta: auditoriasData.map((aud: any) => ({ ...aud, empresa: companyName })),
              clientes: clientesData
            };
          } catch (e) {
            logger.error(`Error fetching data for ${companyName}:`, e);
            return null;
          }
        };

        // 1. Cargar la empresa ACTIVA usando el cliente autenticado principal (supabase)
        const activeData = await fetchCompanyData(supabase, 'Empresa Activa');

        // 2. Intentar cargar Inttec y Daravisa si difieren
        const [inttecData, daravisaData] = await Promise.all([
          fetchCompanyData(inttecClient, 'Inttec'),
          fetchCompanyData(daravisaClient, 'Daravisa')
        ]);

        const context = {
          fecha_actual_sistema: new Date().toISOString(),
          datos_empresa_actual_autenticada: activeData,
          datos_empresa_inttec: inttecData,
          datos_empresa_daravisa: daravisaData
        };

        logger.info('[ChatIA] Contexto cargado con éxito:', {
          gastos_activa: activeData?.gastos?.length || 0,
          ventas_activa: activeData?.ventas?.length || 0,
          usuarios_activa: activeData?.usuarios?.length || 0,
        });

        setDbContext(context);
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
    
    // Guardar el historial para enviarlo a Gemini (excluyendo el msj actual y mensajes sin rol claro)
    const historyToPass = messages.map(m => ({ role: m.role, text: m.text }));
    
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    
    // Auto-scroll al final
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/dashboard')} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Chat Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatContainer}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
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
    </SafeAreaView>
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


