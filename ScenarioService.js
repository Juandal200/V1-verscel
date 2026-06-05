var ScenarioService = {
  seedSampleScenarios: function(adminUser) {
    var now = now_();
    var existing = dbReadAll_('Scenarios');

    if (existing.length > 0) {
      return {
        ok: true,
        message: 'Scenarios already exist. No sample data was inserted.',
        total: existing.length
      };
    }

    var samples = [
      {
        scenarioId: uuid_('SCN'),
        scenarioOrder: 1,
        level: 1,
        country: 'USA',
        context: 'PHASE 1: Pre-flight / Startup',
        atcText: 'FASTAIR 345 START UP APPROVED TEMPERATURE MINUS 2',
        expectedReadback: 'START UP APPROVED FASTAIR 345',
        keywords: 'START UP APPROVED|FASTAIR 345',
        imageFileId: '',
        videoUrl: '',
        audioUrl: '',
        isActive: true,
        version: 1,
        createdBy: adminUser.userId,
        createdAt: now,
        updatedAt: now
      },
      {
        scenarioId: uuid_('SCN'),
        scenarioOrder: 2,
        level: 1,
        country: 'USA',
        context: 'PHASE 2: Taxi Clearance',
        atcText: 'FASTAIR 345 TAXI TO HOLDING POINT RUNWAY 27 VIA ALPHA',
        expectedReadback: 'TAXI TO HOLDING POINT RUNWAY 27 VIA ALPHA FASTAIR 345',
        keywords: 'TAXI|RUNWAY 27|ALPHA|FASTAIR 345',
        imageFileId: '',
        videoUrl: '',
        audioUrl: '',
        isActive: true,
        version: 1,
        createdBy: adminUser.userId,
        createdAt: now,
        updatedAt: now
      },
      {
        scenarioId: uuid_('SCN'),
        scenarioOrder: 3,
        level: 1,
        country: 'USA',
        context: 'PHASE 3: Frequency Change',
        atcText: 'FASTAIR 345 CONTACT ALEXANDER CONTROL 129.1',
        expectedReadback: '129.1 FASTAIR 345',
        keywords: '129.1|FASTAIR 345',
        imageFileId: '',
        videoUrl: '',
        audioUrl: '',
        isActive: true,
        version: 1,
        createdBy: adminUser.userId,
        createdAt: now,
        updatedAt: now
      }
    ];

    dbWithScriptLock_(function() {
      samples.forEach(function(item) {
        dbAppend_('Scenarios', item);
      });
    });

    LogService.admin(
      adminUser.userId,
      'SEED_SAMPLE_SCENARIOS',
      'Scenarios',
      'BULK',
      {},
      { total: samples.length }
    );

    return {
      ok: true,
      message: 'Sample scenarios inserted successfully.',
      total: samples.length
    };
  },

  listScenariosForAdmin: function() {
    return dbReadAll_('Scenarios')
      .sort(function(a, b) {
        var levelA = Number(a.level || 0);
        var levelB = Number(b.level || 0);
        var countryA = String(a.country || '');
        var countryB = String(b.country || '');
        var orderA = Number(a.scenarioOrder || 0);
        var orderB = Number(b.scenarioOrder || 0);

        if (levelA !== levelB) return levelA - levelB;
        if (countryA !== countryB) return countryA.localeCompare(countryB);
        return orderA - orderB;
      })
      .map(function(row) {
        return ScenarioService.toAdminScenario(row);
      });
  },

  saveScenarioByAdmin: function(payload, adminUser) {
    var normalized = this.normalizeScenarioPayload_(payload);

    return dbWithScriptLock_(function() {
      var now = now_();
      var existing = normalized.scenarioId
        ? dbFindOne_('Scenarios', 'scenarioId', normalized.scenarioId)
        : null;

      if (existing) {
        var before = ScenarioService.toAdminScenario(existing);

        var patch = {
          scenarioOrder: normalized.scenarioOrder,
          level: normalized.level,
          country: normalized.country,
          context: normalized.context,
          atcText: normalized.atcText,
          expectedReadback: normalized.expectedReadback,
          keywords: normalized.keywords,
          imageFileId: normalized.imageFileId,
          videoUrl: normalized.videoUrl,
          audioUrl: normalized.audioUrl,
          isActive: normalized.isActive,
          version: Number(existing.version || 1) + 1,
          updatedAt: now
        };

        dbUpdateByRow_('Scenarios', existing.__rowNumber, patch);

        var updated = mergeObjects_(existing, patch);

        LogService.admin(
          adminUser.userId,
          'SCENARIO_UPDATED',
          'Scenarios',
          updated.scenarioId,
          before,
          ScenarioService.toAdminScenario(updated)
        );

        return {
          ok: true,
          message: 'Scenario updated successfully.',
          scenario: ScenarioService.toAdminScenario(updated)
        };
      }

      var created = {
        scenarioId: uuid_('SCN'),
        scenarioOrder: normalized.scenarioOrder,
        level: normalized.level,
        country: normalized.country,
        context: normalized.context,
        atcText: normalized.atcText,
        expectedReadback: normalized.expectedReadback,
        keywords: normalized.keywords,
        imageFileId: normalized.imageFileId,
        videoUrl: normalized.videoUrl,
        audioUrl: normalized.audioUrl,
        isActive: normalized.isActive,
        version: 1,
        createdBy: adminUser.userId,
        createdAt: now,
        updatedAt: now
      };

      dbAppend_('Scenarios', created);

      LogService.admin(
        adminUser.userId,
        'SCENARIO_CREATED',
        'Scenarios',
        created.scenarioId,
        {},
        ScenarioService.toAdminScenario(created)
      );

      return {
        ok: true,
        message: 'Scenario created successfully.',
        scenario: ScenarioService.toAdminScenario(created)
      };
    });
  },

  setScenarioActiveByAdmin: function(payload, adminUser) {
    if (!payload || !payload.scenarioId) {
      throw new Error('Missing scenarioId.');
    }

    var isActive =
      payload.isActive === true ||
      String(payload.isActive).toUpperCase() === 'TRUE';

    return dbWithScriptLock_(function() {
      var scenario = dbFindOne_('Scenarios', 'scenarioId', payload.scenarioId);

      if (!scenario) {
        throw new Error('Scenario not found.');
      }

      var before = ScenarioService.toAdminScenario(scenario);

      var patch = {
        isActive: isActive,
        version: Number(scenario.version || 1) + 1,
        updatedAt: now_()
      };

      dbUpdateByRow_('Scenarios', scenario.__rowNumber, patch);

      var updated = mergeObjects_(scenario, patch);

      LogService.admin(
        adminUser.userId,
        isActive ? 'SCENARIO_ACTIVATED' : 'SCENARIO_DEACTIVATED',
        'Scenarios',
        updated.scenarioId,
        before,
        ScenarioService.toAdminScenario(updated)
      );

      return {
        ok: true,
        message: isActive ? 'Scenario activated.' : 'Scenario deactivated.',
        scenario: ScenarioService.toAdminScenario(updated)
      };
    });
  },

  listActiveScenarios: function() {
    return dbReadAll_('Scenarios')
      .filter(function(row) {
        return ScenarioService.isTruthy_(row.isActive);
      })
      .sort(function(a, b) {
        return Number(a.scenarioOrder || 0) - Number(b.scenarioOrder || 0);
      })
      .map(function(row) {
        return ScenarioService.toPublicScenario(row);
      });
  },

  getScenarioById: function(scenarioId) {
    var scenario = dbFindOne_('Scenarios', 'scenarioId', scenarioId);

    if (!scenario) {
      throw new Error('Scenario not found.');
    }

    return this.toPublicScenario(scenario);
  },

  normalizeScenarioPayload_: function(payload) {
    payload = payload || {};

    var scenarioOrder = Number(payload.scenarioOrder || 0);
    var level = Number(payload.level || 1);
    var country = String(payload.country || 'USA').trim();
    var context = String(payload.context || '').trim();
    var atcText = String(payload.atcText || '').trim();
    var expectedReadback = String(payload.expectedReadback || '').trim();
    var keywords = this.normalizeKeywords_(payload.keywords || payload.keywordsText || '');

    if (!scenarioOrder || scenarioOrder < 1) {
      throw new Error('Scenario order must be a positive number.');
    }

    if (!level || level < 1) {
      throw new Error('Level must be a positive number.');
    }

    if (!country) {
      throw new Error('Country is required.');
    }

    if (!context) {
      throw new Error('Context is required.');
    }

    if (!atcText) {
      throw new Error('ATC text is required.');
    }

    if (!expectedReadback) {
      throw new Error('Expected read-back is required.');
    }

    if (!keywords) {
      throw new Error('At least one keyword is required.');
    }

    return {
      scenarioId: String(payload.scenarioId || '').trim(),
      scenarioOrder: scenarioOrder,
      level: level,
      country: country,
      context: context,
      atcText: atcText,
      expectedReadback: expectedReadback,
      keywords: keywords,
      imageFileId: String(payload.imageFileId || '').trim(),
      videoUrl: String(payload.videoUrl || '').trim(),
      audioUrl: String(payload.audioUrl || '').trim(),
      isActive:
        payload.isActive === true ||
        String(payload.isActive).toUpperCase() === 'TRUE'
    };
  },

  normalizeKeywords_: function(value) {
    if (Array.isArray(value)) {
      return value
        .map(function(item) {
          return String(item || '').trim();
        })
        .filter(Boolean)
        .join('|');
    }

    return String(value || '')
      .split(/\||\n/)
      .map(function(item) {
        return item.trim();
      })
      .filter(Boolean)
      .join('|');
  },

  toPublicScenario: function(row) {
    return {
      scenarioId: row.scenarioId,
      scenarioOrder: Number(row.scenarioOrder || 0),
      level: Number(row.level || 1),
      country: row.country || '',
      context: row.context || '',
      atcText: row.atcText || '',
      expectedReadback: row.expectedReadback || '',
      keywords: String(row.keywords || '')
        .split('|')
        .map(function(k) { return k.trim(); })
        .filter(Boolean),
      imageFileId: row.imageFileId || '',
      videoUrl: row.videoUrl || '',
      audioUrl: row.audioUrl || '',
      isActive: ScenarioService.isTruthy_(row.isActive),
      version: Number(row.version || 1)
    };
  },

  toAdminScenario: function(row) {
    var publicScenario = this.toPublicScenario(row);

    publicScenario.keywordsText = String(row.keywords || '');
    publicScenario.createdBy = row.createdBy || '';
    publicScenario.createdAt = row.createdAt || '';
    publicScenario.updatedAt = row.updatedAt || '';

    return publicScenario;
  },

  isTruthy_: function(value) {
    return value === true || String(value).toUpperCase() === 'TRUE';
  },

  getTrainingCatalog: function(user) {
    user = user || {};

    var isTruthy = function(value) {
      return value === true || String(value).toUpperCase() === 'TRUE';
    };

    var activeScenarios = dbReadAll_('Scenarios')
      .filter(function(row) {
        return isTruthy(row.isActive);
      })
      .map(function(row) {
        return {
          scenarioId: row.scenarioId || '',
          scenarioOrder: Number(row.scenarioOrder || 0),
          level: Number(row.level || 1),
          country: String(row.country || '').trim(),
          flightScenarioId: row.flightScenarioId || '',
          flightScenarioName: row.flightScenarioName || '',
          phaseCode: row.phaseCode || '',
          phaseName: row.phaseName || '',
          phaseOrder: Number(row.phaseOrder || row.scenarioOrder || 1),
          phaseLabel: row.phaseLabel || row.phaseCode || '',
          scenarioType: String(row.scenarioType || 'NORMAL').toUpperCase(),
          emergencyType: row.emergencyType || '',
          context: row.context || '',
          atcText: row.atcText || '',
          expectedReadback: row.expectedReadback || '',
          keywords: String(row.keywords || '')
            .split('|')
            .map(function(k) {
              return k.trim();
            })
            .filter(Boolean),
          imageFileId: row.imageFileId || '',
          videoUrl: row.videoUrl || '',
          audioUrl: row.audioUrl || '',
          isActive: isTruthy(row.isActive),
          version: Number(row.version || 1)
        };
      });

    // Capture first imageFileId per level so level cards can show backgrounds
    var levelImages = {};
    activeScenarios.forEach(function(s) {
      var lvl = Number(s.level || 1);
      if (!levelImages[lvl] && s.imageFileId) levelImages[lvl] = s.imageFileId;
    });

    var levelsMap = {};
    var progressRows = dbReadAll_('Progress').filter(function(row) {
      return String(row.userId || '') === String(user.userId || '');
    });

    var progressMap = {};

    progressRows.forEach(function(row) {
      var key =
        Number(row.level || 1) +
        '||' +
        String(row.country || '').trim().toUpperCase();

      progressMap[key] = row;
    });

    activeScenarios.forEach(function(scenario) {
      var level = Number(scenario.level || 1);
      var country = String(scenario.country || '').trim();

      if (!country) {
        return;
      }

      if (!levelsMap[level]) {
        levelsMap[level] = {
          level: level,
          countriesMap: {}
        };
      }

      var countryKey = country.toUpperCase();

      if (!levelsMap[level].countriesMap[countryKey]) {
        levelsMap[level].countriesMap[countryKey] = {
          country: country,
          level: level,
          totalScenarios: 0,
          completedScenarios: 0,
          progressPct: 0,
          scoreAvg: 0,
          completed: false
        };
      }

      levelsMap[level].countriesMap[countryKey].totalScenarios += 1;
    });

    var sortedLevels = Object.keys(levelsMap)
      .map(function(key) {
        return Number(key);
      })
      .sort(function(a, b) {
        return a - b;
      });

    var levels = sortedLevels.map(function(level) {
      var countriesMap = levelsMap[level].countriesMap;

      var countries = Object.keys(countriesMap)
        .sort()
        .map(function(countryKey) {
          var item = countriesMap[countryKey];
          var progress = progressMap[level + '||' + countryKey];

          if (progress) {
            item.completedScenarios = Number(progress.completedScenarios || 0);
            item.progressPct = Number(progress.progressPct || 0);
            item.scoreAvg = Number(progress.scoreAvg || 0);
            item.completed = isTruthy(progress.completed);
          }

          return item;
        });

      var completedCountries = countries.filter(function(country) {
        return country.completed;
      }).length;

      return {
        level: level,
        totalCountries: countries.length,
        completedCountries: completedCountries,
        completed: countries.length === 0 || completedCountries >= countries.length,
        countries: countries,
        imageFileId: levelImages[level] || ''
      };
    });

    var previousLevelsCompleted = true;

    levels.forEach(function(levelItem) {
      levelItem.unlocked = levelItem.level === 1 || previousLevelsCompleted;
      levelItem.locked = !levelItem.unlocked;

      previousLevelsCompleted = previousLevelsCompleted && levelItem.completed;
    });

    var highestUnlocked = 1;
    levels.forEach(function(l) {
      if (l.unlocked) highestUnlocked = Math.max(highestUnlocked, l.level);
    });

    return {
      totalLevels: levels.length,
      highestUnlockedLevel: highestUnlocked,
      levels: levels
    };
  },

  getScenariosForStudent: function(user, payload) {
    payload = payload || {};
    user = user || {};

    var isTruthy = function(value) {
      return value === true || String(value).toUpperCase() === 'TRUE';
    };

    var requestedLevel = Number(payload.level || user.currentLevel || 1);
    var selectedCountry = String(payload.country || user.currentCountry || 'USA').trim();

    if (!selectedCountry) {
      throw new Error('Country is required.');
    }

    var _role = String((user && user.role) || '').toUpperCase();
    if (_role !== ROLES.ADMIN && _role !== ROLES.INSTRUCTOR) {
      var canAccessLevel = true;

      if (requestedLevel > 1) {
        for (var lvl = 1; lvl < requestedLevel; lvl++) {
          if (!ProgressService.getLevelCompletion(user, lvl).completed) {
            canAccessLevel = false;
            break;
          }
        }
      }

      if (!canAccessLevel) {
        throw new Error('This level is locked. Complete previous levels first.');
      }
    }

    var scenarios = dbReadAll_('Scenarios')
      .filter(function(row) {
        return isTruthy(row.isActive) &&
          Number(row.level || 1) === requestedLevel &&
          String(row.country || '').trim().toUpperCase() === selectedCountry.toUpperCase();
      })
      .map(function(row) {
        return {
          scenarioId: row.scenarioId || '',
          scenarioOrder: Number(row.scenarioOrder || 0),
          level: Number(row.level || 1),
          country: String(row.country || '').trim(),
          flightScenarioId: row.flightScenarioId || '',
          flightScenarioName: row.flightScenarioName || '',
          phaseCode: row.phaseCode || '',
          phaseName: row.phaseName || '',
          phaseOrder: Number(row.phaseOrder || row.scenarioOrder || 1),
          phaseLabel: row.phaseLabel || row.phaseCode || '',
          scenarioType: String(row.scenarioType || 'NORMAL').toUpperCase(),
          emergencyType: row.emergencyType || '',
          context: row.context || '',
          atcText: row.atcText || '',
          expectedReadback: row.expectedReadback || '',
          keywords: String(row.keywords || '')
            .split('|')
            .map(function(k) {
              return k.trim();
            })
            .filter(Boolean),
          imageFileId: row.imageFileId || '',
          videoUrl: row.videoUrl || '',
          audioUrl: row.audioUrl || '',
          isActive: isTruthy(row.isActive),
          version: Number(row.version || 1)
        };
      })
      .sort(function(a, b) {
        if (Number(a.phaseOrder || 0) !== Number(b.phaseOrder || 0)) {
          return Number(a.phaseOrder || 0) - Number(b.phaseOrder || 0);
        }

        return Number(a.scenarioOrder || 0) - Number(b.scenarioOrder || 0);
      });

    return {
      currentLevel: requestedLevel,
      currentCountry: selectedCountry,
      totalScenarios: scenarios.length,
      scenarios: scenarios
    };
  }

};