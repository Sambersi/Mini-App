// empire/logic/businessLogic.js

// --- Маппинг ID типа бизнеса -> строковое имя и БАЗОВАЯ конфигурация + maxLevel ---
// Это нужно для команды /give_business и для покупки/улучшения
const BUSINESS_TYPES_MAP = {
    1: { 
      name: 'mine', // Строковое имя для базы данных
      baseConfig: { 
          name: 'Шахта', // Отображаемое имя
          emoji: '⛏️',
          description: 'Добывает полезные ископаемые.', // Краткое описание
          baseCost: 1000, 
          baseImpPerHour: 10, 
          costMultiplier: 1.5, 
          impPerHourMultiplier: 1.3, 
          upgradeCurrency: 'PF' // валюта для улучшения
      },
      maxLevel: 5 // Устанавливаем максимальный уровень для Шахты
    },
    2: { 
      name: 'factory', // Строковое имя для базы данных
      baseConfig: { 
          name: 'Фабрика', // Отображаемое имя
          emoji: '🏭',
          description: 'Производит товары из сырья.', // Краткое описание
          baseCost: 2000, 
          baseImpPerHour: 25, 
          costMultiplier: 1.6, 
          impPerHourMultiplier: 1.4, 
          upgradeCurrency: 'PF' 
      },
      maxLevel: 7 // Устанавливаем максимальный уровень для Фабрики
    },
    3: { 
      name: 'shop', // Строковое имя для базы данных
      baseConfig: { 
          name: 'Лавка', // Отображаемое имя
          emoji: '🏪',
          description: 'Продаёт товары покупателям.', // Краткое описание
          baseCost: 500, 
          baseImpPerHour: 5, 
          costMultiplier: 1.4, 
          impPerHourMultiplier: 1.2, 
          upgradeCurrency: 'PF' 
      },
      maxLevel: 10 // Устанавливаем максимальный уровень для Лавки
    },
    // ... добавляйте новые типы по мере необходимости
    // 4: { 
    //   name: 'plantation', 
    //   baseConfig: { ... },
    //   maxLevel: X
    // },
    // и т.д.
  };
  
  // --- Функция для получения цены бизнеса по ID типа и уровню ---
  function getBusinessPriceByTypeId(typeId, level = 1) {
      const typeInfo = BUSINESS_TYPES_MAP[typeId];
      if (!typeInfo) return null;
  
      const baseCost = typeInfo.baseConfig.baseCost;
      const costMultiplier = typeInfo.baseConfig.costMultiplier;
      // Цена = baseCost * (multiplier)^(level - 1)
      const price = Math.floor(baseCost * Math.pow(costMultiplier, level - 1));
      return price;
  }
  
  // --- Функция для получения полного конфига бизнеса по ID типа и уровню ---
  function getBusinessConfigByTypeId(typeId, level = 1) {
    const typeInfo = BUSINESS_TYPES_MAP[typeId];
    if (!typeInfo) return null;
  
    // Проверяем, не превышает ли запрашиваемый уровень максимальный
    if (level > typeInfo.maxLevel) {
        console.warn(`[businessLogic] Запрошен конфиг для уровня ${level}, но максимальный уровень для типа ${typeId} - ${typeInfo.maxLevel}`);
        // Можно вернуть null или конфиг максимального уровня, в зависимости от логики
        // level = typeInfo.maxLevel; // Или использовать максимальный уровень
        return null; // Возвращаем null, если уровень превышен
    }
  
    const baseConfig = typeInfo.baseConfig;
    return {
      ...baseConfig,
      cost: getBusinessPriceByTypeId(typeId, level), // Используем новую функцию
      impPerHour: baseConfig.baseImpPerHour * Math.pow(baseConfig.impPerHourMultiplier, level - 1),
      type_id: typeId, // Важно: добавляем ID типа
      currency: baseConfig.upgradeCurrency, // Валюта улучшения
      maxLevel: typeInfo.maxLevel, // Включаем maxLevel в конфиг
    };
  }
  
  // --- Функция для получения цены УЛУЧШЕНИЯ бизнеса (цена перехода с level на level+1) ---
  function getBusinessUpgradePriceByTypeId(typeId, currentLevel) {
      // Цена улучшения = цена бизнеса следующего уровня
      return getBusinessPriceByTypeId(typeId, currentLevel + 1);
  }
  
  // --- Функция для получения имени типа бизнеса по ID ---
  function getBusinessTypeNameById(typeId) {
    const typeInfo = BUSINESS_TYPES_MAP[typeId];
    return typeInfo ? typeInfo.name : null;
  }
  
  // --- Функция для получения максимального уровня бизнеса по ID ---
  function getBusinessMaxLevelByTypeId(typeId) {
      const typeInfo = BUSINESS_TYPES_MAP[typeId];
      return typeInfo ? typeInfo.maxLevel : null;
  }
  
  // --- Старый код (для совместимости с empireHandler и другими) ---
  // Конфигурация типов бизнесов (по строковому имени) - теперь использует базовую конфигурацию
  const BUSINESS_CONFIG = {
    mine: BUSINESS_TYPES_MAP[1]?.baseConfig,
    factory: BUSINESS_TYPES_MAP[2]?.baseConfig,
    shop: BUSINESS_TYPES_MAP[3]?.baseConfig,
    // ... другие, если добавляются
    // Убедитесь, что тут перечислены ВСЕ строковые имена, которые могут быть в базе данных!
    // plantation: { name: 'Плантация', emoji: '...', baseCost: ..., baseImpPerHour: ..., costMultiplier: ..., impPerHourMultiplier: ..., upgradeCurrency: 'PF' },
  };
  
  // Получить конфиг бизнеса (по строковому имени и уровню)
  function getBusinessConfig(type, level = 1) {
    const baseConfig = BUSINESS_CONFIG[type]; // type - строка из базы данных
    if (!baseConfig) {
      console.error(`[businessLogic] Конфигурация для типа бизнеса '${type}' не найдена.`);
      return null; // Возвращаем null, если тип неизвестен
    }
  
    // Нужно найти ID типа по строковому имени
    let typeId = null;
    for (const [id, info] of Object.entries(BUSINESS_TYPES_MAP)) {
        if (info.name === type) { // info.name теперь строковое имя типа (например, 'mine')
            typeId = parseInt(id, 10);
            break;
        }
    }
  
    if (typeId === null) {
        console.error(`[businessLogic] Не найден ID типа для строки '${type}'`);
        return null;
    }
  
    // Используем getBusinessConfigByTypeId для получения полного конфига с учётом уровня
    return getBusinessConfigByTypeId(typeId, level);
  }
  
  // --- Функция для получения ID типа по строковому имени ---
  function getTypeIdByName(typeName) {
      for (const [id, info] of Object.entries(BUSINESS_TYPES_MAP)) {
          if (info.name === typeName) { // info.name теперь строковое имя типа (например, 'mine')
              return parseInt(id, 10);
          }
      }
      return null;
  }
  
  // Расчёт накопленных IMP с последнего начисления (теперь с проверкой config)
  function calculateAccumulatedImp(business, config) {
    // Проверяем, что config существует, прежде чем использовать его свойства
    if (!config) {
        console.error(`[businessLogic] calculateAccumulatedImp: config is null for business ID ${business.id}`);
        return 0; // Возвращаем 0, если конфиг не найден
    }
  
    if (business.wear_percentage >= 100) return 0; // Если разрушен - дохода нет
  
    const now = Math.floor(Date.now() / 1000);
    const lastIncomeTime = business.last_income_time || now;
    const timePassedHours = (now - lastIncomeTime) / 3600;
  
    // Учитываем снижение дохода при износе
    let efficiency = 1.0;
    if (business.wear_percentage >= 80) efficiency = 0.4;
    else if (business.wear_percentage >= 50) efficiency = 0.75;
  
    const generated = timePassedHours * config.impPerHour * efficiency;
    return Math.min(generated + business.imp_accumulated, config.impPerHour * 24); // Ограничение на 24 часа
  }
  
  module.exports = {
    BUSINESS_CONFIG,
    BUSINESS_TYPES_MAP,
    getBusinessPriceByTypeId,
    getBusinessUpgradePriceByTypeId,
    getBusinessConfigByTypeId,
    getBusinessTypeNameById,
    getBusinessMaxLevelByTypeId, // Экспортируем новую функцию
    getBusinessConfig,
    calculateAccumulatedImp,
    getTypeIdByName,
  };
  