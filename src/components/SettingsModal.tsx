import { useState, useEffect, useRef } from "react";
import { Settings, X, Sliders, Bot, Check, AlertCircle, Shield, ChevronDown } from "lucide-react";
import { t, useLocale, Locale } from "../i18n";
import { useTheme, Theme } from "../theme";
import {
  loadModelSettings,
  saveModelSettings,
  testModelConnection,
  DEFAULT_MODEL_SETTINGS,
  ModelProvider,
  ModelSettings,
  fallbackModels,
} from "../model";
import {
  loadDesensitizationConfig,
  saveDesensitizationConfig,
  DesensitizationConfig,
  SensitiveDataType,
} from "../privacy";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS: { label: string; value: ModelProvider; i18nKey: keyof typeof import("../i18n").translations.en }[] = [
  { label: "Ollama", value: "ollama", i18nKey: "ollama" },
  { label: "OpenAI", value: "openai", i18nKey: "openai" },
  { label: "Custom", value: "custom", i18nKey: "custom" },
];

interface SelectOption {
  label: string;
  value: string;
}

function CustomSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="custom-select">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="custom-select-trigger"
      >
        <span className={selected ? "" : "placeholder"}>
          {selected?.label || placeholder || "Select..."}
        </span>
        <ChevronDown className={`chevron ${isOpen ? "open" : ""}`} size={16} />
      </button>
      {isOpen && (
        <div className="custom-select-dropdown">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`custom-select-option ${option.value === value ? "selected" : ""}`}
            >
              {option.label}
              {option.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<"general" | "aiModel" | "privacy">("general");
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS);
  const [privacyConfig, setPrivacyConfig] = useState<DesensitizationConfig>({ enabled: true, types: [] });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [modelList, setModelList] = useState<string[]>([]);
  const [isManualModel, setIsManualModel] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadModelSettings().then((loadedSettings) => {
        setSettings(loadedSettings);
        setIsManualModel(loadedSettings.isManual || false);
        
        // Initialize modelList with fallback models for the current provider
        const defaults = fallbackModels(loadedSettings.provider);
        const list = loadedSettings.model && !defaults.includes(loadedSettings.model)
          ? [loadedSettings.model, ...defaults]
          : defaults;
        setModelList(list);
      });
      setPrivacyConfig(loadDesensitizationConfig());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateSetting = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "provider") {
        const defaults = fallbackModels(value as ModelProvider);
        setModelList(defaults);
        // Default the model to the first fallback model of the new provider
        next.model = defaults[0] || "";
        next.isManual = false;
        setIsManualModel(false);
        setTestResult(null);
      }
      return next;
    });
    if (key !== "provider") {
      setTestResult(null);
    }
  };

  const handleSave = async () => {
    const updatedSettings = { ...settings, isManual: isManualModel };
    await saveModelSettings(updatedSettings);
    saveDesensitizationConfig(privacyConfig);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testModelConnection(settings);
      setTestResult({ ok: result.ok, message: result.message });
      if (result.ok && result.models.length > 0) {
        setModelList(result.models);
        // If the current model is empty, set it to the first fetched model.
        // Otherwise, keep the current model choice.
        if (!settings.model) {
          setSettings((prev) => ({ ...prev, model: result.models[0] }));
        }
      }
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title">
            <Settings className="w-5 h-5" />
            <h2>{t("settings", locale)}</h2>
          </div>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`modal-tab ${activeTab === "general" ? "active" : ""}`}
          >
            <Sliders className="w-4 h-4" />
            <span>{t("tabGeneral", locale)}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("aiModel")}
            className={`modal-tab ${activeTab === "aiModel" ? "active" : ""}`}
          >
            <Bot className="w-4 h-4" />
            <span>{t("tabAiModel", locale)}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("privacy")}
            className={`modal-tab ${activeTab === "privacy" ? "active" : ""}`}
          >
            <Shield className="w-4 h-4" />
            <span>Privacy</span>
          </button>
        </div>

        <div className="modal-body">
          {activeTab === "general" && (
            <div className="settings-section">
              <div className="setting-group">
                <div className="section-label">{t("language", locale)}</div>
                <div className="language-grid">
                  {[
                    { label: t("english", locale), value: "en" as Locale },
                    { label: t("chinese", locale), value: "zh" as Locale },
                  ].map((lang) => (
                    <button
                      key={lang.value}
                      onClick={() => setLocale(lang.value)}
                      className={`lang-btn ${locale === lang.value ? "active" : ""}`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-group">
                <div className="section-label">{t("theme", locale)}</div>
                <div className="theme-grid">
                  {[
                    { label: t("theme_light", locale), value: "light" as Theme },
                    { label: t("theme_dark", locale), value: "dark" as Theme },
                    { label: t("theme_system", locale), value: "system" as Theme },
                  ].map((tOpt) => (
                    <button
                      key={tOpt.value}
                      onClick={() => setTheme(tOpt.value)}
                      className={`theme-btn ${theme === tOpt.value ? "active" : ""}`}
                    >
                      {tOpt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "aiModel" && (
            <div className="settings-section ai-settings">
              <div className="ai-toggle">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => updateSetting("enabled", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
                <div>
                  <div className="toggle-title">{t("aiEnabled", locale)}</div>
                  <div className="toggle-desc">{t("aiEnabledDesc", locale)}</div>
                </div>
              </div>

              {settings.enabled && (
                <>
                  <div className="setting-group">
                    <label className="setting-label">{t("aiProvider", locale)}</label>
                    <div className="provider-grid">
                      {PROVIDERS.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => updateSetting("provider", p.value)}
                          className={`provider-btn ${settings.provider === p.value ? "active" : ""}`}
                        >
                          {t(p.i18nKey, locale)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="setting-group">
                    <label className="setting-label">{t("baseUrl", locale)}</label>
                    <input
                      type="text"
                      value={settings.baseUrl}
                      onChange={(e) => updateSetting("baseUrl", e.target.value)}
                      placeholder={t("baseUrlPlaceholder", locale)}
                      className="setting-input"
                    />
                    <span className="setting-hint">{t("baseUrlHint", locale)}</span>
                  </div>

                  {settings.provider !== "ollama" && (
                    <div className="setting-group">
                      <label className="setting-label">{t("apiKey", locale)}</label>
                      <input
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) => updateSetting("apiKey", e.target.value)}
                        placeholder={t("apiKeyPlaceholder", locale)}
                        className="setting-input"
                      />
                    </div>
                  )}

                  <div className="test-connection">
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={testing}
                      className="btn-test"
                    >
                      {testing ? "Testing..." : "Test Connection"}
                    </button>
                    {testResult && (
                      <span className={`test-result ${testResult.ok ? "success" : "error"}`}>
                        {testResult.ok ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4" />
                            {testResult.message}
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="setting-group">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                      <label className="setting-label" style={{ margin: 0 }}>{t("modelSelect", locale)}</label>
                      <button
                        type="button"
                        onClick={() => setIsManualModel(!isManualModel)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#0f766e",
                          fontSize: "11px",
                          fontWeight: "600",
                          cursor: "pointer",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f1f5f9"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                      >
                        {isManualModel 
                          ? (locale === "zh" ? "从列表选择" : "Select from list") 
                          : (locale === "zh" ? "手动填写" : "Input manually")}
                      </button>
                    </div>
                    {isManualModel ? (
                      <input
                        type="text"
                        value={settings.model}
                        onChange={(e) => updateSetting("model", e.target.value)}
                        placeholder={locale === "zh" ? "请输入模型名称，例如 gpt-4o" : "Enter model name, e.g. gpt-4o"}
                        className="setting-input"
                      />
                    ) : testing ? (
                      <div className="model-loading">
                        {locale === "zh" ? "正在连接并获取模型列表..." : "Testing connection & fetching models..."}
                      </div>
                    ) : (
                      <CustomSelect
                        value={settings.model}
                        options={(modelList.includes(settings.model) ? modelList : (settings.model ? [settings.model, ...modelList] : modelList)).map((m) => ({ label: m, value: m }))}
                        onChange={(v) => updateSetting("model", v)}
                        placeholder={locale === "zh" ? "请选择模型..." : "Select a model..."}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "privacy" && (
            <div className="settings-section privacy-settings">
              <div className="privacy-toggle">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={privacyConfig.enabled}
                    onChange={(e) =>
                      setPrivacyConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                    }
                  />
                  <span className="toggle-slider" />
                </label>
                <div>
                  <div className="toggle-title">Enable Data Desensitization</div>
                  <div className="toggle-desc">
                    Automatically remove sensitive information before sending to AI models
                  </div>
                </div>
              </div>

              {privacyConfig.enabled && (
                <div className="setting-group">
                  <label className="setting-label">Sensitive Data Types to Desensitize</label>
                  <div className="privacy-types-grid">
                    {[
                      { value: "mac" as SensitiveDataType, label: "MAC Address", example: "F4:E1:FC***68" },
                      { value: "sn" as SensitiveDataType, label: "Serial Number", example: "CN***4S" },
                      { value: "smt" as SensitiveDataType, label: "SMT Number", example: "***1234" },
                      { value: "production_date" as SensitiveDataType, label: "Production Date", example: "2024-**-**" },
                    ].map((type) => (
                      <label key={type.value} className="privacy-type-checkbox">
                        <input
                          type="checkbox"
                          checked={privacyConfig.types.includes(type.value)}
                          onChange={(e) => {
                            const types = e.target.checked
                              ? [...privacyConfig.types, type.value]
                              : privacyConfig.types.filter((t) => t !== type.value);
                            setPrivacyConfig((prev) => ({ ...prev, types }));
                          }}
                        />
                        <div className="privacy-type-content">
                          <span className="privacy-type-label">{type.label}</span>
                          <span className="privacy-type-example">{type.example}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="privacy-info">
                <div className="privacy-info-item">
                  <Shield className="w-4 h-4" />
                  <div>
                    <div className="privacy-info-title">Local Processing</div>
                    <div className="privacy-info-desc">
                      All log parsing happens locally. Only desensitized text is sent to AI models.
                    </div>
                  </div>
                </div>
                <div className="privacy-info-item">
                  <Shield className="w-4 h-4" />
                  <div>
                    <div className="privacy-info-title">Audit Logging</div>
                    <div className="privacy-info-desc">
                      All AI model calls are logged for transparency and compliance.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={handleSave} className="btn-primary">
            {t("completeSettings", locale)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
