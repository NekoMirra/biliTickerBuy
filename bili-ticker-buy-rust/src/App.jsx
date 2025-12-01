import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/api/notification";
import { Play, Settings, User, FileJson, Terminal, Clock, Bell, Network, Volume2, LogOut, RefreshCw, Search, CheckSquare, Square, Trash2, Plus, History, X, List, Save, Copy, Crown, ExternalLink, Upload, Download, Github, LayoutDashboard, Rocket } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import logo from "./assets/logo.png";
import "./App.css";

const SALES_FLAG_MAP = {
    1: "不可售",
    2: "预售",
    3: "停售",
    4: "售罄",
    5: "不可用",
    6: "库存紧张",
    8: "暂时售罄",
    9: "不在白名单",
    101: "未开始",
    102: "已结束",
    103: "未完成",
    105: "下架",
    106: "已取消",
};

const hasMaskChar = (value) => typeof value === "string" && value.includes("*");

const pickCleanPhone = (...values) => {
    for (const value of values) {
        if (!value && value !== 0) continue;
        const str = String(value).trim();
        if (!str) continue;
        if (!hasMaskChar(str)) {
            return str;
        }
    }
    return "";
};

const normalizeAddress = (addr) => {
    if (!addr || typeof addr !== "object") return addr;
    const cleanPhone = pickCleanPhone(
        addr.phone,
        addr.tel,
        addr.mobile,
        addr.phone_num,
        addr.contact_tel,
        addr.contact_phone
    );
    if (cleanPhone) {
        return { ...addr, phone: cleanPhone };
    }
    return { ...addr };
};

const getAddressPhone = (addr) => {
    if (!addr) return "";
    return pickCleanPhone(
        addr.phone,
        addr.tel,
        addr.mobile,
        addr.phone_num,
        addr.contact_tel,
        addr.contact_phone
    );
};

const getBuyerPhone = (buyer) => {
    if (!buyer) return "";
    return pickCleanPhone(
        buyer.tel,
        buyer.mobile,
        buyer.phone,
        buyer.contact_tel,
        buyer.contact_phone
    );
};

const sanitizeBuyer = (buyer, fallbackTel = "") => {
    if (!buyer || typeof buyer !== "object") return buyer;
    const cleanPhone = getBuyerPhone(buyer) || fallbackTel || "";
    const sanitized = { ...buyer };
    if (cleanPhone) {
        sanitized.tel = cleanPhone;
        sanitized.mobile = cleanPhone;
        sanitized.phone = cleanPhone;
    }
    return sanitized;
};

function App() {
    const [activeTab, setActiveTab] = useState("run");
    const [tasks, setTasks] = useState([]);
    const [viewMode, setViewMode] = useState("list");

    // Account State
    const [accounts, setAccounts] = useState([]);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState("");
    const [loginStatus, setLoginStatus] = useState("");

    // Active Session
    const [cookies, setCookies] = useState("");
    const [userInfo, setUserInfo] = useState(null);

    // History State
    const [history, setHistory] = useState([]);

    // Config State
    const [projectId, setProjectId] = useState("");
    const [projectInfo, setProjectInfo] = useState(null);
    const [projectHistory, setProjectHistory] = useState([]); // New: Project History
    const [recentInputs, setRecentInputs] = useState([]); // LocalStorage recent inputs
    const [ticketInfo, setTicketInfo] = useState(""); // Legacy manual JSON input
    const [buyers, setBuyers] = useState([]);
    const [selectedBuyers, setSelectedBuyers] = useState([]);
    const [addresses, setAddresses] = useState([]);
    const [buyerAddresses, setBuyerAddresses] = useState({}); // Map buyerId -> address
    const [buyerContactNames, setBuyerContactNames] = useState({}); // Map buyerId -> name
    const [buyerContactTels, setBuyerContactTels] = useState({}); // Map buyerId -> tel
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [contactName, setContactName] = useState("");
    const [contactTel, setContactTel] = useState("");

    // Clock State
    const [now, setNow] = useState(new Date());
    const [isSyncing, setIsSyncing] = useState(false);

    // History Search
    const [historySearch, setHistorySearch] = useState("");

    // Selection State
    const [selectedScreen, setSelectedScreen] = useState(null);
    const [selectedSku, setSelectedSku] = useState(null);
    const [ticketCount, setTicketCount] = useState(1);

    const [timeStart, setTimeStart] = useState("");
    const [requestInterval, setRequestInterval] = useState(1000);
    const [mode, setMode] = useState(0); // 0: infinite, 1: finite
    const [totalAttempts, setTotalAttempts] = useState(10);

    // Advanced Settings
    const [timeOffset, setTimeOffsetState] = useState(0);
    const [ntpServer, setNtpServer] = useState("https://api.bilibili.com/x/report/click/now");
    const [syncInterval, setSyncInterval] = useState(0); // 0 = 不自动同步，只在手动操作时同步
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [proxy, setProxy] = useState("");
    const [notifications, setNotifications] = useState({
        pushplus: "",
        serverchan: "",
        bark: "",
        ntfy: ""
    });

    // Runtime State
    const [logs, setLogs] = useState([]);
    const [paymentUrl, setPaymentUrl] = useState("");
    const logsEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const cookieFileInputRef = useRef(null);

    const updateTimeOffset = (value) => {
        const numeric = Number(value);
        const safeValue = Number.isFinite(numeric) ? numeric : 0;
        setTimeOffsetState(safeValue);
    };

    const getSyncedServerDate = () => {
        if (!Number.isFinite(timeOffset)) return null;
        // 关键修改：基于当前显示的本地时间 now 计算网络时间，确保视觉上的偏差恒定
        return new Date(now.getTime() + timeOffset);
    };

    const syncedServerDate = getSyncedServerDate();

    const formatLocalTimeWithMs = (date) => {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        const s = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    };

    useEffect(() => {
        const saved = localStorage.getItem("bili_recent_inputs");
        if (saved) {
            try {
                setRecentInputs(JSON.parse(saved));
            } catch (e) { }
        }

        const savedSettings = localStorage.getItem("bili_settings");
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                if (settings.proxy) setProxy(settings.proxy);
                if (settings.notifications) setNotifications(settings.notifications);
                if (settings.ntpServer) setNtpServer(settings.ntpServer);
                if (settings.syncInterval) setSyncInterval(settings.syncInterval);
                // timeOffset is usually synced on startup, but we can load it too if needed
                // if (settings.timeOffset) updateTimeOffset(settings.timeOffset);
            } catch (e) { }
        }
    }, []);

    const hasScheduledTask = tasks.some(t => t.status === 'scheduled');

    useEffect(() => {
        // 本地时钟，用于驱动界面时间显示
        // 优化：只在特定场景下更新时间，减少渲染开销
        // 1. 创建任务页面 (activeTab === 'config')
        // 2. 正在同步时间 (isSyncing)
        // 3. 有正在等待的任务 (hasScheduledTask)
        if (activeTab === 'config' || isSyncing || hasScheduledTask) {
            const timer = setInterval(() => {
                setNow(new Date());
            }, 200);
            return () => clearInterval(timer);
        }
    }, [activeTab, isSyncing, hasScheduledTask]);

    useEffect(() => {
        // Request notification permission
        isPermissionGranted().then(granted => {
            if (!granted) {
                requestPermission();
            }
        });

        const unlistenLog = listen("log", (event) => {
            const { task_id, message } = event.payload;
            if (task_id) {
                setTasks(prev => prev.map(t => {
                    if (t.id === task_id) {
                        return { ...t, logs: [...t.logs, message], lastLog: message };
                    }
                    return t;
                }));
            } else {
                setLogs((prev) => [...prev, message]);
            }
        });

        const unlistenTaskResult = listen("task_result", (event) => {
            const { task_id, success, message } = event.payload;

            // Update task status
            setTasks(prev => prev.map(t => {
                if (t.id === task_id) {
                    return { ...t, status: success ? "success" : "stopped", lastLog: message };
                }
                return t;
            }));

            // Send Notifications
            const title = success ? "抢票成功！" : "抢票任务结束";

            // 1. Windows Notification
            sendNotification({
                title: title,
                body: message,
            });

            // 2. Push Channels
            try {
                const savedSettings = localStorage.getItem("bili_settings");
                if (savedSettings) {
                    const settings = JSON.parse(savedSettings);
                    if (settings.notifications) {
                        sendPushNotification(settings.notifications, title, message);
                    }
                }
            } catch (e) { console.error(e); }
        });

        const unlistenPayment = listen("payment_qrcode", (event) => {
            const { task_id, url } = event.payload;
            if (task_id) {
                setTasks(prev => prev.map(t => {
                    if (t.id === task_id) {
                        return { ...t, paymentUrl: url, status: "success" };
                    }
                    return t;
                }));
            } else {
                setPaymentUrl(url);
            }
            // Refresh history when a payment link is generated
            loadHistory();
        });

        // Auto Init
        initApp();

        return () => {
            unlistenLog.then((f) => f());
            unlistenPayment.then((f) => f());
            unlistenTaskResult.then((f) => f());
        };
    }, []);

    async function initApp() {
        await loadAccounts();
        await loadHistory();
        await loadProjectHistory(); // New
        // 启动时只同步一次时间
        await syncTime(true);
    }

    async function loadProjectHistory() {
        try {
            const hist = await invoke("get_project_history");
            if (Array.isArray(hist)) {
                setProjectHistory(hist);
            }
        } catch (e) {
            console.error("Failed to load project history", e);
        }
    }

    async function loadAccounts() {
        try {
            const accs = await invoke("get_accounts");
            setAccounts(accs);
            // Auto-login first account if no active session
            if (accs.length > 0 && !cookies) {
                handleUseAccount(accs[0]);
            }
        } catch (e) {
            console.error("Failed to load accounts", e);
        }
    }

    async function loadHistory() {
        try {
            const hist = await invoke("get_history");
            // Sort by time desc
            setHistory(hist.reverse());
        } catch (e) {
            console.error("Failed to load history", e);
        }
    }

    async function handleClearHistory() {
        if (!confirm("确定要清空所有抢票记录吗？此操作不可恢复。")) return;
        try {
            await invoke("clear_history");
            await loadHistory();
            alert("记录已清空");
        } catch (e) {
            alert("清空失败: " + e);
        }
    }

    async function handleUseAccount(account) {
        setCookies(account.cookies);
        setUserInfo({
            uname: account.name,
            face: account.photo,
            mid: account.uid,
            level: account.level,
            is_vip: account.is_vip,
            coins: account.coins
        });
        // Refresh data for this account
        fetchAddresses(account.cookies);
        // If we have a project ID, refresh buyers too
        if (projectId) {
            fetchBuyers(account.cookies);
        }

        // Auto-refresh user info from API
        try {
            const latestInfo = await fetchUserInfo(account.cookies);
            if (latestInfo) {
                const newInfo = {
                    uname: latestInfo.uname,
                    face: latestInfo.face,
                    mid: latestInfo.mid,
                    level: latestInfo.level_info?.current_level || 0,
                    is_vip: latestInfo.vipStatus === 1,
                    coins: latestInfo.money || 0
                };
                setUserInfo(newInfo);

                // Update local list state to reflect changes immediately
                setAccounts(prev => prev.map(a => {
                    if (a.uid === String(newInfo.mid)) {
                        return {
                            ...a,
                            name: newInfo.uname,
                            face: newInfo.face,
                            level: newInfo.level,
                            is_vip: newInfo.is_vip,
                            coins: newInfo.coins
                        };
                    }
                    return a;
                }));
            }
        } catch (e) {
            console.error("Auto-refresh user info failed", e);
        }
    }

    async function handleRemoveAccount(uid) {
        if (!confirm("确定要删除此账号吗？")) return;
        try {
            await invoke("remove_account", { uid });
            await loadAccounts();
            if (userInfo && userInfo.mid === uid) {
                setCookies("");
                setUserInfo(null);
            }
        } catch (e) {
            alert("删除失败: " + e);
        }
    }

    async function fetchUserInfo(cookieStr) {
        try {
            const cookieArray = typeof cookieStr === 'string' ? JSON.parse(cookieStr) : cookieStr;
            const res = await invoke("get_user_info", { cookies: cookieArray });
            if (res.code === 0 && res.data) {
                return res.data;
            }
            return null;
        } catch (e) {
            console.error("Fetch user info failed", e);
            return null;
        }
    }

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    async function startAddAccount() {
        setShowLoginModal(true);
        getQrCode();
    }

    async function getQrCode() {
        try {
            const [url, key] = await invoke("get_login_qrcode");
            setQrCodeUrl(url);
            setLoginStatus("请扫描二维码...");
            pollLogin(key);
        } catch (e) {
            console.error(e);
            setLoginStatus("错误: " + e);
        }
    }

    async function pollLogin(key) {
        try {
            const result = await invoke("poll_login_status", { qrcodeKey: key });
            if (result.startsWith("[") || result.startsWith("{")) {
                setLoginStatus("登录成功！正在保存账号...");

                try {
                    const cookieArray = JSON.parse(result);
                    await invoke("add_account", { cookies: cookieArray });
                    await loadAccounts();
                    setShowLoginModal(false);
                    setLoginStatus("");
                } catch (e) {
                    setLoginStatus("保存账号失败: " + e);
                }
            } else {
                setLoginStatus(result);
            }
        } catch (e) {
            setLoginStatus("登录失败: " + e);
        }
    }

    async function fetchProject() {
        if (!projectId) return;

        // Support URL input: extract 'id' param
        let id = projectId;
        if (projectId.includes("http")) {
            try {
                const url = new URL(projectId);
                const params = new URLSearchParams(url.search);
                if (params.has("id")) {
                    id = params.get("id");
                    setProjectId(id);
                }
            } catch (e) { }
        }

        try {
            const response = await invoke("fetch_project", { id });
            const code = response.errno !== undefined ? response.errno : response.code;

            if (code === 0 && response.data) {
                setProjectInfo(response.data);

                // Auto fetch buyers
                fetchBuyers(null, id);

                // Save to recent inputs
                if (!recentInputs.includes(id)) {
                    const newRecent = [id, ...recentInputs].slice(0, 10);
                    setRecentInputs(newRecent);
                    localStorage.setItem("bili_recent_inputs", JSON.stringify(newRecent));
                }

                // Auto-set start time if available
                if (response.data.sale_start) {
                    // Convert timestamp to YYYY-MM-DD HH:MM:SS
                    const date = new Date(response.data.sale_start * 1000);
                    const formatted = date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
                    setTimeStart(formatted);
                } else if (response.data.sale_start_str) {
                    setTimeStart(response.data.sale_start_str);
                }

                // Save to project history immediately
                try {
                    await invoke("add_project_history", {
                        item: {
                            project_id: String(id),
                            project_name: response.data.name,
                            screen_id: "",
                            screen_name: "",
                            sku_id: "",
                            sku_name: "",
                            price: 0
                        }
                    });
                    loadProjectHistory();
                } catch (e) {
                    console.error("Failed to save project history", e);
                }

            } else {
                setLogs(prev => [...prev, "获取项目信息失败: " + (response.msg || response.message || JSON.stringify(response))]);
            }
        } catch (e) {
            setLogs(prev => [...prev, "获取项目信息失败: " + e]);
        }
    }

    async function handleRemoveProjectHistory(e, item) {
        e.stopPropagation();
        if (!confirm("确定要删除这条历史记录吗？")) return;
        try {
            await invoke("remove_project_history", {
                projectId: item.project_id,
                skuId: item.sku_id
            });
            loadProjectHistory();
        } catch (err) {
            alert("删除失败: " + err);
        }
    }

    function handleSkuSelect(sku) {
        setSelectedSku(sku);
        if (sku.sale_start) {
            let timeStr = sku.sale_start;
            // If it's a timestamp (number), convert it.
            if (typeof timeStr === 'number') {
                const date = new Date(timeStr * 1000);
                timeStr = date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
            }
            if (timeStr) {
                setTimeStart(timeStr);
                // Optional: Flash a message or log
                // setLogs(prev => [...prev, `已自动填入开售时间: ${timeStr}`]);
            }
        }
    }

    // Save project config when starting task
    async function saveProjectConfig() {
        if (projectInfo && selectedScreen && selectedSku) {
            try {
                await invoke("add_project_history", {
                    item:
                    {
                        project_id: String(projectId),
                        project_name: projectInfo.name,
                        screen_id: String(selectedScreen.id),
                        screen_name: selectedScreen.name,
                        sku_id: String(selectedSku.id),
                        sku_name: selectedSku.desc,
                        price: selectedSku.price
                    }
                });
                loadProjectHistory();
            } catch (e) {
                console.error("Failed to save project history", e);
            }
        }
    }

    function handleExportConfig() {
        const config = {
            projectId,
            screenId: selectedScreen?.id,
            skuId: selectedSku?.id,
            buyerIds: selectedBuyers.map(b => b.id),
            buyerAddresses,
            timeStart,
            interval: requestInterval,
            mode,
            totalAttempts,
            proxy,
            timeOffset
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bili-config-${projectId || "draft"}.json`;
        a.click();
    }

    function handleImportConfig(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const config = JSON.parse(ev.target.result);
                if (config.projectId) {
                    setProjectId(config.projectId);

                    // Fetch project info to restore screen/sku
                    const res = await invoke("fetch_project", { id: config.projectId });
                    if (res.code === 0 && res.data) {
                        setProjectInfo(res.data);

                        if (config.screenId) {
                            const screen = (res.data.screen_list || res.data.screens || []).find(s => String(s.id) === String(config.screenId));
                            if (screen) {
                                setSelectedScreen(screen);
                                if (config.skuId) {
                                    const sku = (screen.ticket_list || []).find(s => String(s.id) === String(config.skuId));
                                    if (sku) setSelectedSku(sku);
                                }
                            }
                        }
                    }
                }

                if (config.timeStart) setTimeStart(config.timeStart);
                if (config.interval) setRequestInterval(config.interval);
                if (config.mode !== undefined) setMode(config.mode);
                if (config.totalAttempts) setTotalAttempts(config.totalAttempts);
                if (config.proxy) setProxy(config.proxy);
                if (typeof config.timeOffset !== "undefined") updateTimeOffset(config.timeOffset);
                if (config.buyerAddresses) {
                    const normalizedMap = Object.fromEntries(
                        Object.entries(config.buyerAddresses).map(([key, addr]) => [key, normalizeAddress(addr)])
                    );
                    setBuyerAddresses(normalizedMap);
                }

                alert("配置导入成功！(请注意：购票人需重新确认)");
            } catch (err) {
                alert("导入失败: " + err);
            }
        };
        reader.readAsText(file);
        // Reset input
        e.target.value = "";
    }

    async function fetchBuyers(cookiesOverride, projectIdOverride) {
        let currentCookies = cookiesOverride;
        // If passed from event handler or undefined, use state
        if (!currentCookies || (currentCookies.type && currentCookies.preventDefault)) {
            currentCookies = cookies;
        }

        let id = projectIdOverride || projectId;
        if (!currentCookies || !id) return;

        if (id.includes("http")) {
            try {
                const url = new URL(id);
                const params = new URLSearchParams(url.search);
                if (params.has("id")) id = params.get("id");
            } catch (e) { }
        }

        try {
            const cookieArray = typeof currentCookies === 'string' ? JSON.parse(currentCookies) : currentCookies;
            const response = await invoke("fetch_buyer_list", {
                projectId: id,
                cookies: cookieArray
            });

            const code = response.errno !== undefined ? response.errno : response.code;

            if (code === 0 && response.data && Array.isArray(response.data.list)) {
                setBuyers(response.data.list);
            } else {
                setLogs(prev => [...prev, "获取购票人失败: " + (response.msg || response.message || JSON.stringify(response))]);
            }
        } catch (e) {
            setLogs(prev => [...prev, "获取购票人列表失败: " + e]);
        }
    }

    async function fetchAddresses(cookiesOverride) {
        setAddresses([]);
        let currentCookies = cookiesOverride;
        if (!currentCookies || (currentCookies.type && currentCookies.preventDefault)) {
            currentCookies = cookies;
        }

        if (!currentCookies) return;
        try {
            const cookieArray = typeof currentCookies === 'string' ? JSON.parse(currentCookies) : currentCookies;
            const response = await invoke("fetch_address_list", { cookies: cookieArray });
            const code = response.errno !== undefined ? response.errno : response.code;
            if (code === 0 && response.data && Array.isArray(response.data.addr_list)) {
                const normalizedList = response.data.addr_list.map(normalizeAddress);
                setAddresses(normalizedList);
                // Debug: 输出获取到的地址数量，方便排查只有一条地址的问题
                console.debug("fetchAddresses: got", normalizedList.length, "addresses", normalizedList);
                const def = normalizedList.find(a => a.is_default);
                if (def) {
                    setSelectedAddress(def);
                    if (def.name) setContactName(def.name);
                    const defPhone = getAddressPhone(def);
                    if (defPhone) setContactTel(defPhone);
                }
            }
        } catch (e) {
            console.error("Fetch addresses failed", e);
        }
    }

    async function syncTime(silent = false) {
        if (!silent) setIsSyncing(true);
        try {
            // Add 5s timeout to prevent UI stuck
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("请求超时")), 5000)
            );

            const result = await Promise.race([
                invoke("sync_time", { serverUrl: ntpServer }),
                timeoutPromise
            ]);

            let offsetNum = 0;
            let localTime = null;

            // Handle new return structure: { diff, server, local }
            if (typeof result === 'object' && result !== null && 'diff' in result) {
                offsetNum = Number(result.diff);
                localTime = Number(result.local);
            } else {
                // Fallback for legacy return (f64)
                offsetNum = Number(result);
            }

            if (Number.isFinite(offsetNum)) {
                updateTimeOffset(offsetNum);
                setLastSyncTime(new Date());

                // 强制校准本地时间显示，确保这一刻完全对齐
                if (localTime && Number.isFinite(localTime)) {
                    setNow(new Date(localTime));
                }

                if (!silent) {
                    setLogs(prev => [...prev, `时间已同步，偏移量: ${offsetNum.toFixed(0)}ms (Server: ${ntpServer})`]);
                }
            }
        } catch (e) {
            if (!silent) {
                setLogs(prev => [...prev, "时间同步失败: " + e]);
            }
        } finally {
            if (!silent) setIsSyncing(false);
        }
    }

    // Helper to format time with milliseconds
    const formatTimeWithMs = (date) => {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        const s = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    };

    function toggleBuyer(buyer) {
        const buyerId = String(buyer.id);
        if (selectedBuyers.find(b => String(b.id) === buyerId)) {
            const newSelected = selectedBuyers.filter(b => String(b.id) !== buyerId);
            setSelectedBuyers(newSelected);
            // Cleanup maps
            const newAddrMap = { ...buyerAddresses };
            delete newAddrMap[buyerId];
            setBuyerAddresses(newAddrMap);

            const newNameMap = { ...buyerContactNames };
            delete newNameMap[buyerId];
            setBuyerContactNames(newNameMap);

            const newTelMap = { ...buyerContactTels };
            delete newTelMap[buyerId];
            setBuyerContactTels(newTelMap);
        } else {
            setSelectedBuyers([...selectedBuyers, buyer]);

            let matchedAddress = null;
            let contactName = buyer.name;
            let contactTel = "";

            const buyerPhoneClean = getBuyerPhone(buyer);
            const buyerPhoneCandidates = [buyerPhoneClean, buyer.tel, buyer.mobile, buyer.phone].filter(Boolean);

            if (addresses.length > 0) {
                // 1) exact name
                matchedAddress = addresses.find(a => a.name === buyer.name);

                // 2) exact phone match (unmasked)
                if (!matchedAddress) {
                    matchedAddress = addresses.find(a => {
                        const addrPhone = getAddressPhone(a);
                        if (!addrPhone) return false;
                        return buyerPhoneCandidates.some(p => {
                            if (!p) return false;
                            const str = String(p).trim();
                            if (!str || str.includes("*")) return false;
                            return str === addrPhone;
                        });
                    });
                }

                // 3) match by last 4 digits
                if (!matchedAddress) {
                    const buyerLast4 = new Set(buyerPhoneCandidates.map(p => String(p || "").replace(/\D/g, "").slice(-4)).filter(Boolean));
                    matchedAddress = addresses.find(a => {
                        const addrPhone = getAddressPhone(a) || a.phone;
                        if (!addrPhone) return false;
                        const digits = String(addrPhone).replace(/\D/g, "");
                        if (!digits) return false;
                        return buyerLast4.has(digits.slice(-4));
                    });
                }

                if (matchedAddress) {
                    matchedAddress = normalizeAddress(matchedAddress);
                }
            }

            if (matchedAddress) {
                contactName = matchedAddress.name || contactName;
                contactTel = getAddressPhone(matchedAddress) || "";
            }

            if (!contactTel) {
                contactTel = buyerPhoneClean;
            }

            // Apply updates
            if (matchedAddress) {
                setBuyerAddresses(prev => ({ ...prev, [buyerId]: matchedAddress }));
            }

            setBuyerContactNames(prev => ({ ...prev, [buyerId]: contactName }));

            if (contactTel && !contactTel.includes("*")) {
                setBuyerContactTels(prev => ({ ...prev, [buyerId]: contactTel }));
            }
        }
    }

    function prepareTaskPayload(singleBuyer = null, specificAddress = null) {
        if (!projectInfo || !selectedScreen || !selectedSku) {
            throw new Error("请先选择项目、场次和票档");
        }
        if (!userInfo) {
            throw new Error("请先选择账号");
        }

        // Determine buyers and address for this payload
        const currentBuyers = singleBuyer ? [singleBuyer] : selectedBuyers;

        // We need to construct buyer_info list where each buyer has the correct contact info
        const sanitizedBuyers = currentBuyers.map(buyer => {
            const buyerId = String(buyer.id);

            // 1. Determine Address
            let addr = specificAddress;
            if (!addr) {
                if (buyerAddresses[buyerId]) {
                    addr = buyerAddresses[buyerId];
                } else if (selectedBuyers.length === 1) {
                    addr = selectedAddress;
                }
            }
            const normAddr = normalizeAddress(addr);
            const addrPhone = getAddressPhone(normAddr);

            // 2. Determine Name & Tel
            // Priority: Specific Input > Global Input (if single) > Address > Profile

            let finalName = "";
            let finalTel = "";

            // Try specific input
            if (buyerContactNames[buyerId]) finalName = buyerContactNames[buyerId];
            if (buyerContactTels[buyerId]) finalTel = buyerContactTels[buyerId];

            // Try global input (only if effectively single buyer context)
            if (!finalName && selectedBuyers.length === 1) finalName = contactName;
            if (!finalTel && selectedBuyers.length === 1) finalTel = contactTel;

            // Try address
            if (!finalName && normAddr?.name) finalName = normAddr.name;
            if (!finalTel && addrPhone) finalTel = addrPhone;

            // Try profile
            if (!finalName && buyer.name) finalName = buyer.name;
            if (!finalTel) finalTel = getBuyerPhone(buyer);

            // 3. Construct Buyer Object
            const newBuyer = { ...buyer };
            if (finalName) {
                newBuyer.name = finalName;
                newBuyer.contact_name = finalName;
            }
            if (finalTel) {
                newBuyer.tel = finalTel;
                newBuyer.mobile = finalTel;
                newBuyer.phone = finalTel;
                newBuyer.contact_tel = finalTel;
            }

            // 4. Embed Deliver Info (for backend to pick up per-buyer)
            if (normAddr) {
                const dInfo = { ...normAddr };
                if (finalName && !dInfo.name) dInfo.name = finalName;
                if (finalTel) {
                    dInfo.phone = finalTel;
                    dInfo.tel = finalTel;
                    dInfo.contact_tel = finalTel;
                }
                newBuyer.deliver_info = dInfo;
            }

            return newBuyer;
        });

        let finalTicketInfo = ticketInfo;

        // Determine top-level contact info (mostly for single-buyer compatibility)
        let topName = "";
        let topTel = "";
        let topDeliverInfo = {};

        if (sanitizedBuyers.length > 0) {
            // Use the first buyer's info as default for top-level
            topName = sanitizedBuyers[0].contact_name || sanitizedBuyers[0].name;
            topTel = sanitizedBuyers[0].contact_tel || sanitizedBuyers[0].tel;
            if (sanitizedBuyers[0].deliver_info) {
                topDeliverInfo = sanitizedBuyers[0].deliver_info;
            }
        }

        const payload = {
            project_id: String(projectId),
            project_name: projectInfo.name,
            screen_id: String(selectedScreen.id),
            screen_name: selectedScreen.name,
            sku_id: String(selectedSku.id),
            sku_name: selectedSku.desc,
            count: currentBuyers.length,
            buyer_info: sanitizedBuyers,
            deliver_info: topDeliverInfo,
            cookies: typeof cookies === 'string' ? JSON.parse(cookies) : cookies,
            is_hot_project: false,
            pay_money: selectedSku.price,
            contact_name: topName,
            contact_tel: topTel
        };

        finalTicketInfo = JSON.stringify(payload);

        return {
            ticketInfo: finalTicketInfo,
            interval: parseInt(requestInterval),
            mode: parseInt(mode),
            totalAttempts: parseInt(totalAttempts),
            timeStart,
            proxy,
            timeOffset: parseFloat(timeOffset),
            buyers: sanitizedBuyers,
            ntpServer
        };
    }

    async function startBuy() {
        try {
            setLogs([]);
            setPaymentUrl("");
            saveProjectConfig();

            if (selectedBuyers.length === 0) {
                alert("请至少选择一个购票人");
                return;
            }

            // Auto sync time
            let currentOffset = timeOffset;
            let syncLog = "";
            try {
                setLogs(prev => [...prev, "正在自动校准时间..."]);
                const result = await invoke("sync_time");

                let offsetValue = 0;
                if (typeof result === 'object' && result !== null && 'diff' in result) {
                    offsetValue = Number(result.diff);
                    if (result.local) setNow(new Date(result.local));
                } else {
                    offsetValue = Number(result);
                }

                const safeOffset = Number.isFinite(offsetValue) ? offsetValue : 0;
                updateTimeOffset(safeOffset);
                currentOffset = safeOffset;
                syncLog = `时间已自动校准，偏移量: ${safeOffset}ms`;
                setLogs(prev => [...prev, syncLog]);
            } catch (e) {
                syncLog = "时间自动校准失败: " + e;
                setLogs(prev => [...prev, syncLog]);
            }

            setLogs(prev => [...prev, `正在启动任务，共 ${selectedBuyers.length} 个购票人...`]);

            try {
                // Bundle all buyers into one task
                const args = prepareTaskPayload(); // No args = use all selectedBuyers
                args.timeOffset = parseFloat(currentOffset);

                setLogs(prev => [...prev, `请求参数: ${args.ticketInfo}`]);

                let parsedTicket = null;
                try {
                    parsedTicket = JSON.parse(args.ticketInfo);
                } catch (err) {
                    console.warn("无法解析 ticketInfo", err);
                }

                // Call backend
                const taskId = await invoke("start_buy", args);
                console.debug("start_buy invoked", {
                    taskId,
                    contactTel: parsedTicket?.contact_tel,
                    buyerInfo: parsedTicket?.buyer_info
                });

                const newTask = {
                    id: taskId,
                    project: projectInfo?.name || projectId,
                    screen: selectedScreen?.name || "Default",
                    sku: selectedSku?.desc || "Default",
                    buyerCount: selectedBuyers.length,
                    buyers: selectedBuyers, // Store all buyers
                    startTime: timeStart || new Date().toLocaleTimeString(),
                    status: timeStart ? "scheduled" : "running",
                    logs: [syncLog],
                    lastLog: timeStart ? `Waiting for ${timeStart}` : `Starting for ${selectedBuyers.length} buyers...`,
                    paymentUrl: "",
                    accountName: userInfo?.uname || "Unknown",
                    args: args
                };

                setTasks(prev => [newTask, ...prev]);
                setLogs(prev => [...prev, `✅ 任务已启动`]);
                setActiveTab("tasks");
                if (selectedBuyers.length > 1) {
                    setViewMode("grid");
                }

            } catch (err) {
                setLogs(prev => [...prev, `❌ 启动失败: ${err.message || err}`]);
                alert(`启动失败: ${err.message || err}`);
            }

        } catch (e) {
            setLogs((prev) => [...prev, "启动流程异常: " + e]);
            alert("启动流程异常: " + e);
        }
    }

    function saveTask() {
        try {
            if (selectedBuyers.length === 0) {
                alert("请至少选择一个购票人");
                return;
            }

            // Auto-start scheduled tasks
            if (timeStart) {
                startBuy();
                return;
            }

            const args = prepareTaskPayload();
            // Generate a temporary ID for pending task
            const tempId = "pending-" + Date.now();

            const newTask = {
                id: tempId,
                project: projectInfo?.name || projectId,
                screen: selectedScreen?.name || "Default",
                sku: selectedSku?.desc || "Default",
                buyerCount: selectedBuyers.length,
                buyers: selectedBuyers,
                startTime: "-",
                status: "pending",
                logs: [],
                lastLog: "Ready to start",
                paymentUrl: "",
                accountName: userInfo?.uname || "Unknown",
                args: args
            };

            setTasks(prev => [newTask, ...prev]);
            setActiveTab("tasks");
            alert(`已保存任务到任务列表`);
        } catch (e) {
            alert("保存任务失败: " + e);
        }
    }

    async function runPendingTask(task) {
        try {
            // Remove the pending task
            setTasks(prev => prev.filter(t => t.id !== task.id));

            // Start the actual task
            const taskId = await invoke("start_buy", task.args);

            const runningTask = {
                ...task,
                id: taskId,
                startTime: new Date().toLocaleTimeString(),
                status: "running",
                lastLog: "Starting...",
                logs: []
            };

            setTasks(prev => [runningTask, ...prev]);
        } catch (e) {
            alert("启动任务失败: " + e);
            // Put it back if failed? Or just leave it removed? 
            // Better to keep it as pending if failed, but for simplicity let's just alert.
        }
    }

    async function stopTask(taskId) {
        try {
            await invoke("stop_task", { taskId });
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "stopped" } : t));
        } catch (e) {
            console.error("Stop task failed", e);
        }
    }

    async function startAllTasks() {
        const pendingTasks = tasks.filter(t => t.status === 'pending');
        if (pendingTasks.length === 0) {
            alert("没有待启动的任务");
            return;
        }

        if (!confirm(`确定要启动所有 ${pendingTasks.length} 个待办任务吗？`)) return;

        for (const task of pendingTasks) {
            await runPendingTask(task);
            await new Promise(r => setTimeout(r, 50));
        }
    }

    async function handleBatchUpdateTime() {
        const newTime = prompt("请输入新的开始时间 (格式: YYYY-MM-DD HH:mm:ss)", timeStart || "");
        if (!newTime) return;

        setTasks(prev => prev.map(t => {
            if (t.status === 'pending') {
                return {
                    ...t,
                    startTime: newTime,
                    args: { ...t.args, timeStart: newTime }
                };
            }
            return t;
        }));

        const scheduledTasks = tasks.filter(t => t.status === 'scheduled');
        if (scheduledTasks.length > 0) {
            if (confirm(`发现 ${scheduledTasks.length} 个正在倒计时的任务，是否也要更新它们的时间？(这将重启这些任务)`)) {
                for (const task of scheduledTasks) {
                    await stopTask(task.id);
                    const newArgs = { ...task.args, timeStart: newTime };
                    try {
                        const newTaskId = await invoke("start_buy", newArgs);
                        setTasks(prev => {
                            const filtered = prev.filter(t => t.id !== task.id);
                            const newTask = {
                                ...task,
                                id: newTaskId,
                                startTime: newTime,
                                status: "scheduled",
                                logs: [],
                                lastLog: `Rescheduled to ${newTime}`,
                                args: newArgs
                            };
                            return [newTask, ...filtered];
                        });
                    } catch (e) {
                        console.error("Failed to restart task", task.id, e);
                    }
                }
            }
        }
    }

    function handleExportCookie(account) {
        try {
            const cookieItems = account.cookies.map(c => {
                const parts = c.split(';');
                const [key, value] = parts[0].split('=');
                return { name: key.trim(), value: value ? value.trim() : "" };
            });

            const exportData = {
                "_default": {
                    "1": {
                        "key": "cookie",
                        "value": cookieItems
                    }
                }
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${account.name || "bili-cookie"}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert("导出失败: " + e);
        }
    }

    function handleImportCookie(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const json = JSON.parse(ev.target.result);
                const items = json?._default?.["1"]?.value;
                if (!Array.isArray(items)) throw new Error("格式不正确");

                const cookies = items.map(item => `${item.name}=${item.value}`);
                if (cookies.length === 0) throw new Error("未找到 Cookie");

                await invoke("add_account", { cookies });
                await loadAccounts();
                alert("导入成功！");
            } catch (err) {
                alert("导入失败: " + err);
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    }

    const TabButton = ({ id, icon: Icon, label }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 p-3 w-full rounded-lg transition-colors ${activeTab === id
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
        >
            <Icon size={20} />
            <span className="font-medium">{label}</span>
        </button>
    );

    function handleSaveSettings() {
        const settings = {
            proxy,
            notifications,
            timeOffset,
            ntpServer,
            syncInterval
        };
        localStorage.setItem("bili_settings", JSON.stringify(settings));
        alert("设置已保存");
    }

    async function handleTestPush(type) {
        const title = "B站抢票助手测试";
        const content = "这是一条测试消息，如果您收到此消息，说明推送配置正确。";
        let url = "";
        let method = "GET";
        let body = null;
        let headers = {};

        try {
            switch (type) {
                case "pushplus":
                    if (!notifications.pushplus) throw new Error("请输入 PushPlus Token");
                    url = `http://www.pushplus.plus/send?token=${notifications.pushplus}&title=${encodeURIComponent(title)}&content=${encodeURIComponent(content)}`;
                    break;
                case "serverchan":
                    if (!notifications.serverchan) throw new Error("请输入 ServerChan Key");
                    url = `https://sctapi.ftqq.com/${notifications.serverchan}.send?title=${encodeURIComponent(title)}&desp=${encodeURIComponent(content)}`;
                    break;
                case "bark":
                    if (!notifications.bark) throw new Error("请输入 Bark Token");
                    // Bark format: https://api.day.app/{token}/{title}/{content}
                    // Handle if token is a full URL or just token
                    let barkBase = notifications.bark;
                    if (!barkBase.startsWith("http")) {
                        barkBase = `https://api.day.app/${barkBase}`;
                    }
                    // Remove trailing slash
                    if (barkBase.endsWith("/")) barkBase = barkBase.slice(0, -1);
                    url = `${barkBase}/${encodeURIComponent(title)}/${encodeURIComponent(content)}`;
                    break;
                case "ntfy":
                    if (!notifications.ntfy) throw new Error("请输入 Ntfy Topic");
                    let ntfyBase = "https://ntfy.sh";
                    let topic = notifications.ntfy;
                    if (topic.startsWith("http")) {
                        ntfyBase = topic; // User provided full URL?
                    } else {
                        url = `${ntfyBase}/${topic}`;
                    }
                    method = "POST";
                    body = content;
                    headers = { "Title": title };
                    break;
                default:
                    return;
            }

            const res = await fetch(url, {
                method,
                headers,
                body
            });

            if (res.ok) {
                alert("发送成功，请检查手机");
            } else {
                const text = await res.text();
                alert(`发送失败: ${res.status} ${text}`);
            }
        } catch (e) {
            alert(`测试失败: ${e.message}`);
        }
    }

    return (
        <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-gray-950 p-4 flex flex-col border-r border-gray-800">
                <div className="flex items-center gap-2 mb-8 px-2">
                    <img src={logo} alt="Logo" className="w-8 h-8 rounded-lg" />
                    <h1 className="text-xl font-bold">B站抢票助手</h1>
                </div>

                {userInfo ? (
                    <div className="mb-6 px-2 flex items-center gap-3 bg-gray-900 p-3 rounded-lg border border-gray-800">
                        <img
                            src={userInfo.face}
                            referrerPolicy="no-referrer"
                            alt="Avatar"
                            className={`w-10 h-10 rounded-full border-2 ${userInfo.is_vip ? 'border-pink-500' : 'border-blue-500'} bg-gray-800`}
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = "https://s1.hdslb.com/bfs/static/jinkela/long/images/512.png";
                            }}
                        />
                        <div className="overflow-hidden flex-1">
                            <div className={`font-bold text-sm truncate flex items-center gap-1 ${userInfo.is_vip ? 'text-pink-400' : ''}`}>
                                {userInfo.uname}
                                {userInfo.is_vip && <Crown size={14} fill="currentColor" />}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${userInfo.is_vip ? 'bg-pink-900/30 text-pink-300' : 'bg-blue-900/30 text-blue-300'}`}>Lv.{userInfo.level || 0}</span>
                                <span className="text-yellow-500 flex items-center gap-0.5" title="硬币">
                                    <span className="w-3 h-3 rounded-full border border-yellow-500 flex items-center justify-center text-[8px]">$</span>
                                    {userInfo.coins || 0}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mb-6 px-2 p-3 rounded-lg border border-gray-800 bg-gray-900 text-center text-sm text-gray-500">
                        未选择账号
                    </div>
                )}

                <nav className="flex-1 space-y-2">
                    <TabButton id="run" icon={LayoutDashboard} label="仪表盘" />
                    <TabButton id="tasks" icon={List} label="任务列表" />
                    <TabButton id="config" icon={FileJson} label="创建任务" />
                    <TabButton id="history" icon={History} label="抢票记录" />
                    <TabButton id="settings" icon={Settings} label="高级设置" />
                    <TabButton id="login" icon={User} label="账号管理" />
                    <TabButton id="about" icon={Bell} label="关于" />
                </nav>

                <div className="mt-auto pt-4 border-t border-gray-800">
                    <div className="text-xs text-gray-500 text-center">
                        v2.1.0
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Header */}
                <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
                    <h2 className="text-lg font-semibold capitalize">
                        {activeTab === "run" && "仪表盘"}
                        {activeTab === "tasks" && "任务列表"}
                        {activeTab === "config" && "创建任务"}
                        {activeTab === "history" && "抢票记录"}
                        {activeTab === "settings" && "高级设置"}
                        {activeTab === "login" && "账号管理"}
                        {activeTab === "about" && "关于"}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800 px-3 py-1 rounded-full" title={`本地时间`}>
                            <Clock size={14} />
                            <span className="font-mono w-32">{formatLocalTimeWithMs(now)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-blue-400 bg-blue-900/20 px-3 py-1 rounded-full" title={`NTP时间 = 本地时间 + ${timeOffset}ms`}>
                            <Network size={14} className={isSyncing ? "animate-spin" : ""} />
                            <span className="font-mono font-bold w-28">
                                {lastSyncTime && syncedServerDate ? formatTimeWithMs(syncedServerDate) : "未同步"}
                            </span>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto p-6">

                    {/* DASHBOARD TAB */}
                    {activeTab === "run" && (
                        <div className="max-w-5xl mx-auto space-y-8">
                            {/* Status Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-lg text-white relative overflow-hidden">
                                    <div className="relative z-10">
                                        <div className="text-blue-200 text-sm font-bold mb-1">当前账号</div>
                                        <div className="text-2xl font-bold mb-2 truncate">{userInfo ? userInfo.uname : "未登录"}</div>
                                        <div className="flex items-center gap-2 text-sm opacity-80">
                                            {userInfo ? (
                                                <>
                                                    <span className="bg-black/20 px-2 py-0.5 rounded">Lv.{userInfo.level}</span>
                                                    {userInfo.is_vip && <span className="bg-pink-500/50 px-2 py-0.5 rounded">大会员</span>}
                                                </>
                                            ) : "请前往账号管理登录"}
                                        </div>
                                    </div>
                                    <User className="absolute right-4 bottom-4 text-white/10 w-24 h-24" />
                                </div>

                                <div className="bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-700 relative overflow-hidden">
                                    <div className="relative z-10">
                                        <div className="text-gray-400 text-sm font-bold mb-1">系统状态</div>
                                        <div className="text-2xl font-bold mb-2 font-mono">{now.toLocaleTimeString()}</div>
                                        <div className="flex items-center gap-2 text-sm text-green-400">
                                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                            运行正常
                                        </div>
                                    </div>
                                    <Clock className="absolute right-4 bottom-4 text-gray-700 w-24 h-24" />
                                </div>

                                <div className="bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-700 relative overflow-hidden">
                                    <div className="relative z-10">
                                        <div className="text-gray-400 text-sm font-bold mb-1">运行中任务</div>
                                        <div className="text-2xl font-bold mb-2">{tasks.filter(t => t.status === 'running' || t.status === 'scheduled').length}</div>
                                        <div className="text-sm text-gray-500">
                                            总任务数: {tasks.length}
                                        </div>
                                    </div>
                                    <List className="absolute right-4 bottom-4 text-gray-700 w-24 h-24" />
                                </div>
                            </div>

                            {/* Navigation Grid */}
                            <div>
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <LayoutDashboard className="text-blue-400" />
                                    功能导航
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <button
                                        onClick={() => setActiveTab("config")}
                                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 p-6 rounded-xl transition-all group text-left"
                                    >
                                        <div className="w-12 h-12 bg-blue-900/50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <Rocket className="text-blue-400" size={24} />
                                        </div>
                                        <div className="font-bold text-lg mb-1">创建任务</div>
                                        <div className="text-xs text-gray-500">配置并启动新的抢票任务</div>
                                    </button>

                                    <button
                                        onClick={() => setActiveTab("tasks")}
                                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-green-500 p-6 rounded-xl transition-all group text-left"
                                    >
                                        <div className="w-12 h-12 bg-green-900/50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <List className="text-green-400" size={24} />
                                        </div>
                                        <div className="font-bold text-lg mb-1">任务列表</div>
                                        <div className="text-xs text-gray-500">查看和管理运行中的任务</div>
                                    </button>

                                    <button
                                        onClick={() => setActiveTab("history")}
                                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-purple-500 p-6 rounded-xl transition-all group text-left"
                                    >
                                        <div className="w-12 h-12 bg-purple-900/50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <History className="text-purple-400" size={24} />
                                        </div>
                                        <div className="font-bold text-lg mb-1">抢票记录</div>
                                        <div className="text-xs text-gray-500">查看历史订单和支付链接</div>
                                    </button>

                                    <button
                                        onClick={() => setActiveTab("login")}
                                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 p-6 rounded-xl transition-all group text-left"
                                    >
                                        <div className="w-12 h-12 bg-orange-900/50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <User className="text-orange-400" size={24} />
                                        </div>
                                        <div className="font-bold text-lg mb-1">账号管理</div>
                                        <div className="text-xs text-gray-500">添加或切换 Bilibili 账号</div>
                                    </button>
                                </div>
                            </div>

                            {/* Recent Logs Preview */}
                            <div className="bg-black rounded-xl border border-gray-800 p-4 font-mono text-xs overflow-hidden flex flex-col shadow-inner h-64">
                                <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-900">
                                    <span className="text-gray-500 font-bold flex items-center gap-2">
                                        <Terminal size={14} />
                                        系统日志
                                    </span>
                                    <button onClick={() => setLogs([])} className="text-gray-600 hover:text-gray-400">清空</button>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                                    {logs.length === 0 && <div className="text-gray-700 italic text-center mt-10">暂无日志...</div>}
                                    {logs.map((log, i) => (
                                        <div key={i} className="text-green-400 break-all">
                                            <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                            {log}
                                        </div>
                                    ))}
                                    <div ref={logsEndRef} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TASKS TAB */}
                    {activeTab === "tasks" && (
                        <div className={viewMode === "grid" ? "h-full flex flex-col" : "max-w-6xl mx-auto space-y-6"}>
                            <div className={`flex items-center justify-between ${viewMode === "grid" ? "px-4 pt-4 mb-2" : "mb-6"}`}>
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <List className="text-blue-400" />
                                    运行中的任务
                                </h3>
                                <div className="flex items-center gap-3">
                                    <div className="flex gap-2 mr-2">
                                        <button onClick={startAllTasks} className="text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded flex items-center gap-1">
                                            <Play size={14} /> 全部启动
                                        </button>
                                        <button onClick={handleBatchUpdateTime} className="text-sm bg-blue-700 hover:bg-blue-600 text-white px-3 py-1 rounded flex items-center gap-1">
                                            <Clock size={14} /> 统一改时
                                        </button>
                                    </div>
                                    <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                                        <button
                                            onClick={() => setViewMode("list")}
                                            className={`p-1.5 rounded ${viewMode === "list" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                                            title="列表视图"
                                        >
                                            <List size={16} />
                                        </button>
                                        <button
                                            onClick={() => setViewMode("grid")}
                                            className={`p-1.5 rounded ${viewMode === "grid" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                                            title="网格视图 (命令窗口模式)"
                                        >
                                            <div className="grid grid-cols-2 gap-0.5 w-4 h-4">
                                                <div className="bg-current rounded-[1px]"></div>
                                                <div className="bg-current rounded-[1px]"></div>
                                                <div className="bg-current rounded-[1px]"></div>
                                                <div className="bg-current rounded-[1px]"></div>
                                            </div>
                                        </button>
                                    </div>
                                    <button onClick={() => setTasks([])} className="text-sm text-gray-500 hover:text-white">
                                        清空已完成任务
                                    </button>
                                </div>
                            </div>

                            <div className={viewMode === "grid" ? "flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 overflow-y-auto" : "grid grid-cols-1 gap-4"}>
                                {tasks.length === 0 && (
                                    <div className="col-span-full text-center py-12 text-gray-500 bg-gray-800/50 rounded-xl border border-dashed border-gray-700">
                                        暂无任务，请前往“创建任务”页面开始
                                    </div>
                                )}
                                {tasks.map(task => (
                                    <div key={task.id} className={`bg-gray-800 rounded-xl border border-gray-700 shadow-lg flex flex-col ${viewMode === "grid" ? "h-[500px]" : "p-6"}`}>
                                        <div className={viewMode === "grid" ? "p-3 border-b border-gray-700 bg-gray-900/50" : "flex items-start justify-between mb-4"}>
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${task.status === 'running' ? 'bg-green-500 animate-pulse' :
                                                        task.status === 'success' ? 'bg-blue-500' :
                                                            task.status === 'pending' ? 'bg-yellow-500' :
                                                                'bg-red-500'
                                                        }`} />
                                                    <div className="overflow-hidden">
                                                        <div className="font-bold text-sm truncate flex items-center gap-2">
                                                            <span className="text-white">
                                                                {task.buyers
                                                                    ? task.buyers.map(b => b.name).join(", ")
                                                                    : (task.buyer?.name || "未知购票人")
                                                                }
                                                            </span>
                                                        </div>
                                                        <span className="text-xs text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-700">
                                                            {task.accountName}
                                                        </span>
                                                        {task.status === 'pending' && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">待启动</span>}
                                                        {task.status === 'scheduled' && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded animate-pulse">定时</span>}
                                                    </div>
                                                    <div className="text-xs text-gray-400 truncate mt-0.5">
                                                        {task.project}
                                                    </div>
                                                    {viewMode === "list" && (
                                                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                                                            {task.screen} - {task.sku}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                                {task.status === 'pending' && (
                                                    <button
                                                        onClick={() => runPendingTask(task)}
                                                        className="p-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold"
                                                        title="启动"
                                                    >
                                                        <Play size={14} />
                                                    </button>
                                                )}
                                                {(task.status === 'running' || task.status === 'scheduled') && (
                                                    <button
                                                        onClick={() => stopTask(task.id)}
                                                        className="p-1.5 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded text-xs font-bold border border-red-900/50"
                                                        title="停止"
                                                    >
                                                        <Square size={14} fill="currentColor" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setTasks(prev => prev.filter(t => t.id !== task.id))}
                                                    className="p-1.5 text-gray-500 hover:text-red-400"
                                                    title="删除任务"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        {viewMode === "list" && (
                                            <div className="text-xs text-gray-500 font-mono mt-1 ml-7">
                                                {task.startTime}
                                            </div>
                                        )}

                                        {/* Payment URL & QR Code */}
                                        {
                                            task.paymentUrl && (
                                                <div className={`${viewMode === "grid" ? "p-2" : "mb-4"} bg-green-900/20 border-b border-green-900/50 flex flex-col items-center gap-2`}>
                                                    <span className="text-green-400 font-bold text-sm">抢票成功！</span>
                                                    <div className="bg-white p-1 rounded">
                                                        <QRCodeCanvas value={task.paymentUrl} size={viewMode === "grid" ? 100 : 150} />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <a href={task.paymentUrl} target="_blank" rel="noreferrer" className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold">
                                                            支付
                                                        </a>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(task.paymentUrl);
                                                                alert("链接已复制");
                                                            }}
                                                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                                                        >
                                                            复制
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        {/* Logs Preview */}
                                        <div className={`bg-black font-mono text-xs overflow-y-auto custom-scrollbar ${viewMode === "grid" ? "flex-1 p-2" : "rounded-lg p-3 h-32 bg-black/50"}`}>
                                            {(viewMode === "grid" ? task.logs : task.logs.slice(-10)).map((log, i) => (
                                                <div key={i} className="text-gray-300 break-all border-b border-gray-800/50 last:border-0 py-0.5">
                                                    <span className="text-gray-600 mr-1">[{new Date().toLocaleTimeString()}]</span>
                                                    {log}
                                                </div>
                                            ))}
                                            {task.logs.length === 0 && <div className="text-gray-600 italic text-center mt-4">等待日志...</div>}
                                            {/* Auto scroll anchor */}
                                            <div ref={(el) => {
                                                if (el && viewMode === "grid") {
                                                    el.scrollIntoView({ behavior: "smooth" });
                                                }
                                            }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                    }

                    {/* CONFIG TAB */}
                    {
                        activeTab === "config" && (
                            <div className="w-full max-w-[95%] mx-auto bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        <FileJson className="text-blue-400" />
                                        任务配置
                                    </h3>
                                    <div className="flex gap-2">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept=".json"
                                            onChange={handleImportConfig}
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold border border-gray-600"
                                            title="导入配置"
                                        >
                                            <FileJson size={16} /> 导入
                                        </button>
                                        <button
                                            onClick={handleExportConfig}
                                            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold border border-gray-600"
                                            title="导出配置"
                                        >
                                            <Save size={16} /> 导出
                                        </button>
                                        <button
                                            onClick={saveTask}
                                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold border border-gray-600"
                                        >
                                            <Save size={20} />
                                            保存
                                        </button>
                                        <button
                                            onClick={startBuy}
                                            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-6 py-2 rounded-lg flex items-center gap-2 font-bold shadow-lg transform transition active:scale-95"
                                        >
                                            <Rocket size={20} />
                                            立即启动
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Column 1: History */}
                                    <div className="space-y-4 bg-gray-900/50 p-4 rounded-xl border border-gray-700 h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar flex flex-col">
                                        <h4 className="font-bold text-gray-400 flex items-center gap-2 mb-2">
                                            <History size={16} /> 历史项目配置
                                        </h4>

                                        <div className="relative mb-2">
                                            <input
                                                type="text"
                                                placeholder="搜索历史项目..."
                                                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                                                value={historySearch}
                                                onChange={(e) => setHistorySearch(e.target.value)}
                                            />
                                            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                                            {(!projectHistory || projectHistory.length === 0) && (
                                                <div className="text-gray-600 text-xs text-center mt-10">暂无历史记录</div>
                                            )}
                                            {projectHistory
                                                .filter(p => !historySearch || p.project_name.toLowerCase().includes(historySearch.toLowerCase()))
                                                .map((p, i) => (
                                                    <div
                                                        key={i}
                                                        onClick={() => {
                                                            setProjectId(p.project_id);
                                                            setTimeout(() => fetchProject(), 50);
                                                        }}
                                                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-lg p-3 cursor-pointer transition-all group relative"
                                                    >
                                                        <div className="font-bold text-sm text-white mb-1 line-clamp-2 pr-6">{p.project_name}</div>
                                                        <div className="text-xs text-gray-400 space-y-1">
                                                            {p.screen_name ? (
                                                                <>
                                                                    <div className="flex justify-between">
                                                                        <span>{p.screen_name}</span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="bg-gray-900 px-1.5 py-0.5 rounded text-gray-500">{p.sku_name}</span>
                                                                        <span className="text-yellow-500">￥{p.price / 100}</span>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <div className="text-gray-500 italic mt-1">点击查看详情</div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={(e) => handleRemoveProjectHistory(e, p)}
                                                            className="absolute top-2 right-2 p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="删除此记录"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>

                                    {/* Left Column: Project & Buyers */}
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">项目 ID / 链接</label>
                                            <div className="flex gap-2 mb-2">
                                                <input
                                                    type="text"
                                                    list="recent-projects"
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                    value={projectId}
                                                    onChange={(e) => setProjectId(e.target.value)}
                                                    placeholder="输入 ID 或粘贴链接..."
                                                />
                                                <datalist id="recent-projects">
                                                    {recentInputs.map((id, i) => (
                                                        <option key={i} value={id} />
                                                    ))}
                                                </datalist>
                                                <button
                                                    onClick={fetchProject}
                                                    className="bg-blue-600 hover:bg-blue-500 px-4 rounded-lg flex items-center justify-center"
                                                >
                                                    <Search size={20} />
                                                </button>
                                            </div>
                                        </div>

                                        {projectInfo && (
                                            <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 text-sm space-y-4">
                                                <div>
                                                    <div className="font-bold text-white text-lg mb-1">{projectInfo.name}</div>
                                                    <div className="text-gray-400 mb-2">{projectInfo.venue_name}</div>

                                                    {/* Project Details */}
                                                    <div className="bg-gray-800/50 p-2 rounded text-xs space-y-1">
                                                        <div className="flex gap-2">
                                                            <span className="text-gray-500">开售时间:</span>
                                                            <span className="text-white font-mono">
                                                                {projectInfo.sale_start
                                                                    ? new Date(projectInfo.sale_start * 1000).toLocaleString()
                                                                    : (projectInfo.sale_start_str || "未知")}
                                                            </span>
                                                        </div>
                                                        {projectInfo.sale_end && (
                                                            <div className="flex gap-2">
                                                                <span className="text-gray-500">结束时间:</span>
                                                                <span className="text-white font-mono">
                                                                    {new Date(projectInfo.sale_end * 1000).toLocaleString()}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {/* Tags / VIP Info */}
                                                        {projectInfo.tags && projectInfo.tags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {projectInfo.tags.map((tag, i) => {
                                                                    const tagName = typeof tag === 'object' ? tag.tag_name : tag;
                                                                    return (
                                                                        <span key={i} className={`px-1.5 py-0.5 rounded border text-[10px] ${String(tagName).includes('大会员')
                                                                            ? 'bg-pink-900/30 text-pink-300 border-pink-800/50'
                                                                            : 'bg-blue-900/30 text-blue-300 border-blue-800/50'
                                                                            }`}>
                                                                            {tagName}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Screens */}
                                                <div>
                                                    <label className="text-xs text-gray-500 block mb-2">选择场次</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(projectInfo.screen_list || projectInfo.screens || []).map(screen => (
                                                            <button
                                                                key={screen.id}
                                                                onClick={() => {
                                                                    setSelectedScreen(screen);
                                                                    setSelectedSku(null);
                                                                }}
                                                                className={`px-3 py-2 rounded border text-xs text-left transition-colors ${selectedScreen?.id === screen.id
                                                                    ? "bg-blue-600 border-blue-500 text-white"
                                                                    : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                                                    }`}
                                                            >
                                                                <div className="font-bold">{screen.name}</div>
                                                                {screen.screen_type === 2 && <div className="text-[10px] text-pink-300 mt-0.5">大会员优先</div>}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* SKUs */}
                                                {selectedScreen && (
                                                    <div className="mt-4">
                                                        <label className="text-xs text-gray-500 block mb-2">选择票档 (点击自动填入时间)</label>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(selectedScreen.ticket_list || []).map(sku => {
                                                                // Determine status text
                                                                let statusText = "有票";
                                                                let statusColor = "text-green-400";
                                                                if (!sku.clickable) {
                                                                    statusText = SALES_FLAG_MAP[sku.sale_flag_number] || "缺货";
                                                                    statusColor = "text-red-400";
                                                                } else if (sku.sale_flag_number && SALES_FLAG_MAP[sku.sale_flag_number]) {
                                                                    statusText = SALES_FLAG_MAP[sku.sale_flag_number];
                                                                    if (statusText !== "有票" && statusText !== "预售") statusColor = "text-yellow-400";
                                                                }

                                                                return (
                                                                    <button
                                                                        key={sku.id}
                                                                        onClick={() => handleSkuSelect(sku)}
                                                                        className={`px-3 py-2 rounded border text-xs text-left transition-colors min-w-[120px] ${selectedSku?.id === sku.id
                                                                            ? "bg-purple-600 border-purple-500 text-white"
                                                                            : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                                                            }`}
                                                                    >
                                                                        <div className="font-bold">{sku.desc}</div>
                                                                        <div className="flex items-center justify-between gap-2 mt-1">
                                                                            <span className="text-yellow-400">￥{sku.price / 100}</span>
                                                                            <span className={`text-[10px] ${statusColor}`}>
                                                                                {statusText}
                                                                            </span>
                                                                        </div>
                                                                        {sku.sale_start && (
                                                                            <div className="text-[10px] text-gray-400 mt-1 scale-90 origin-left">
                                                                                {sku.sale_start}
                                                                            </div>
                                                                        )}
                                                                        {/* 显示SKU标签 */}
                                                                        {sku.tags && Array.isArray(sku.tags) && sku.tags.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                                {sku.tags.map((t, i) => {
                                                                                    const tName = typeof t === 'object' ? t.tag_name : t;
                                                                                    return <span key={i} className="text-[10px] bg-white/10 px-1 rounded">{tName}</span>;
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="block text-sm font-medium text-gray-400 mb-2">购票人</label>
                                                <div className="flex items-center gap-3">
                                                    {selectedBuyers.length > 0 && (
                                                        <button onClick={() => {
                                                            setSelectedBuyers([]);
                                                            setBuyerAddresses({});
                                                            setBuyerContactNames({});
                                                            setBuyerContactTels({});
                                                        }} className="text-red-400 text-xs hover:underline flex items-center gap-1">
                                                            <Trash2 size={12} /> 清空
                                                        </button>
                                                    )}
                                                    <button onClick={() => fetchBuyers()} className="text-blue-400 text-xs hover:underline flex items-center gap-1">
                                                        <RefreshCw size={12} /> 刷新
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 h-64 overflow-y-auto custom-scrollbar">
                                                {(!buyers || buyers.length === 0) && <div className="text-gray-600 text-center mt-10 text-sm">请先登录并刷新列表</div>}
                                                {Array.isArray(buyers) && buyers.map(buyer => {
                                                    const isSelected = selectedBuyers.find(b => b.id === buyer.id);
                                                    return (
                                                        <div key={buyer.id} className="mb-1">
                                                            <div
                                                                onClick={() => toggleBuyer(buyer)}
                                                                className={`flex items-center gap-3 p-2 rounded cursor-pointer ${isSelected ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
                                                            >
                                                                {isSelected
                                                                    ? <CheckSquare size={18} className="text-blue-500" />
                                                                    : <Square size={18} className="text-gray-600" />}
                                                                <span className="text-sm">{buyer.name}</span>
                                                                <span className="text-xs text-gray-500 ml-auto">{buyer.personal_id}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="block text-sm font-medium text-gray-400">
                                                    {selectedBuyers.length > 1 ? "收货地址 (分别为每个购票人设置)" : "收货地址"}
                                                </label>
                                                <div className="flex gap-3">
                                                    <button onClick={() => {
                                                        if (confirm("确定要清空所有已分配的地址和联系人信息吗？(这也将清空已选购票人)")) {
                                                            setBuyerAddresses({});
                                                            setBuyerContactNames({});
                                                            setBuyerContactTels({});
                                                            setSelectedAddress(null);
                                                            setContactName("");
                                                            setContactTel("");
                                                            setSelectedBuyers([]);
                                                        }
                                                    }} className="text-red-400 text-xs hover:underline flex items-center gap-1">
                                                        <Trash2 size={12} /> 全部清空
                                                    </button>
                                                    <button onClick={() => fetchAddresses()} className="text-blue-400 text-xs hover:underline flex items-center gap-1">
                                                        <RefreshCw size={12} /> 刷新
                                                    </button>
                                                </div>
                                            </div>

                                            {selectedBuyers.length > 1 ? (
                                                <div className="space-y-2 bg-gray-900/50 p-2 rounded-lg border border-gray-700/50 max-h-80 overflow-y-auto custom-scrollbar">
                                                    {selectedBuyers.map(buyer => (
                                                        <div key={buyer.id} className="flex flex-col gap-2 bg-gray-900 p-2 rounded border border-gray-700">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex flex-col w-24">
                                                                    <span className="text-sm font-bold truncate" title={buyer.name}>{buyer.name}</span>
                                                                    <span className="text-[10px] text-gray-500 truncate">{buyer.personal_id}</span>
                                                                </div>
                                                                <select
                                                                    className="flex-1 bg-gray-800 border border-gray-600 rounded p-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                                                                    value={buyerAddresses[String(buyer.id)] ? JSON.stringify(buyerAddresses[String(buyer.id)]) : ""}
                                                                    onChange={(e) => {
                                                                        if (e.target.value) {
                                                                            const addr = normalizeAddress(JSON.parse(e.target.value));
                                                                            setBuyerAddresses(prev => ({ ...prev, [String(buyer.id)]: addr }));

                                                                            // Only auto-fill name if it's currently empty or matches the previous address name
                                                                            // But for now, let's NOT auto-fill name if we already have a name set (which is likely the buyer's name)
                                                                            // Unless the user explicitly wants to use the address contact.
                                                                            // Compromise: If the current name is the buyer's name, keep it. Otherwise use address name.

                                                                            setBuyerContactNames(prev => {
                                                                                const currentName = prev[String(buyer.id)];
                                                                                // If current name is empty, or equals the buyer's name (and we want to switch? No, usually we want to keep buyer name)
                                                                                // Actually, if I select an address, I usually want to ship TO that person.
                                                                                // But here we are in "Split Order" mode.
                                                                                // Let's just NOT auto-fill name if it's already set.
                                                                                if (!currentName) {
                                                                                    return { ...prev, [String(buyer.id)]: addr.name };
                                                                                }
                                                                                return prev;
                                                                            });

                                                                            let phone = getAddressPhone(addr);
                                                                            if (!phone) {
                                                                                phone = getBuyerPhone(buyer);
                                                                            }

                                                                            if (phone && !phone.includes("*")) {
                                                                                setBuyerContactTels(prev => ({ ...prev, [String(buyer.id)]: phone }));
                                                                            }
                                                                        }
                                                                    }}
                                                                >
                                                                    <option value="">-- 选择地址 --</option>
                                                                    {Array.isArray(addresses) && addresses.map(addr => (
                                                                        <option key={addr.id} value={JSON.stringify(addr)}>
                                                                            {addr.name} - {addr.phone} - {addr.prov}{addr.city}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <button onClick={() => {
                                                                    toggleBuyer(buyer);
                                                                }} className="text-gray-500 hover:text-red-400 p-1" title="移除此购票人">
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                            <div className="flex gap-2 pl-26">
                                                                <input
                                                                    type="text"
                                                                    placeholder="联系人"
                                                                    className="flex-1 bg-gray-800 border border-gray-600 rounded p-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                                                                    value={buyerContactNames[String(buyer.id)] || ""}
                                                                    onChange={(e) => setBuyerContactNames(prev => ({ ...prev, [String(buyer.id)]: e.target.value }))}
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="联系电话"
                                                                    className="flex-1 bg-gray-800 border border-gray-600 rounded p-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                                                                    value={buyerContactTels[String(buyer.id)] || ""}
                                                                    onChange={(e) => setBuyerContactTels(prev => ({ ...prev, [String(buyer.id)]: e.target.value }))}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <select
                                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                                    value={selectedAddress ? JSON.stringify(selectedAddress) : ""}
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            const addr = normalizeAddress(JSON.parse(e.target.value));
                                                            setSelectedAddress(addr);
                                                            if (addr.name) setContactName(addr.name);
                                                            const phone = getAddressPhone(addr);
                                                            if (phone) setContactTel(phone);
                                                        } else {
                                                            setSelectedAddress(null);
                                                        }
                                                    }}
                                                >
                                                    <option value="">无需地址 / 请选择</option>
                                                    {Array.isArray(addresses) && addresses.map(addr => (
                                                        <option key={addr.id} value={JSON.stringify(addr)}>
                                                            {addr.name} - {addr.phone} - {addr.prov}{addr.city}{addr.area}...
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>

                                        {selectedBuyers.length <= 1 && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-400 mb-2">联系人姓名 (必填)</label>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                        value={contactName}
                                                        onChange={(e) => setContactName(e.target.value)}
                                                        placeholder="手动填写..."
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-400 mb-2">联系电话 (必填)</label>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                        value={contactTel}
                                                        onChange={(e) => setContactTel(e.target.value)}
                                                        placeholder="手动填写..."
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {selectedBuyers.length > 1 && (
                                            <div className="text-xs text-gray-500 text-center bg-gray-900/30 p-2 rounded border border-gray-800 border-dashed">
                                                已启用多人模式，请在上方分别为每个购票人确认联系方式
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column: Settings */}
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-2">开始时间 (定时抢票)</label>
                                                <div className="space-y-2">
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="datetime-local"
                                                            step="1"
                                                            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                                                            value={timeStart.replace(' ', 'T')}
                                                            onChange={(e) => setTimeStart(e.target.value.replace('T', ' '))}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const now = new Date();
                                                                const str = now.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
                                                                setTimeStart(str);
                                                            }}
                                                            className="px-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-bold text-xs whitespace-nowrap transition-colors"
                                                            title="设为当前时间"
                                                        >
                                                            当前
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <button
                                                            onClick={() => {
                                                                const now = new Date();
                                                                now.setSeconds(59);
                                                                now.setMilliseconds(900);
                                                                const str = now.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
                                                                setTimeStart(str);
                                                            }}
                                                            className="py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-300 transition-colors"
                                                        >
                                                            +59秒
                                                        </button>
                                                        {[1, 5, 10].map(m => (
                                                            <button
                                                                key={m}
                                                                onClick={() => {
                                                                    const now = new Date();
                                                                    now.setMinutes(now.getMinutes() + m);
                                                                    now.setSeconds(0);
                                                                    const str = now.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
                                                                    setTimeStart(str);
                                                                }}
                                                                className="py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-300 transition-colors"
                                                            >
                                                                +{m}分
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-2">请求间隔 (ms)</label>
                                                <input
                                                    type="number"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                    value={requestInterval}
                                                    onChange={(e) => setRequestInterval(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">尝试次数</label>
                                            <input
                                                type="number"
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                value={totalAttempts}
                                                onChange={(e) => setTotalAttempts(e.target.value)}
                                                disabled={mode === 0}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">运行模式</label>
                                            <div className="flex gap-4">
                                                <label className={`flex-1 cursor-pointer p-4 rounded-lg border ${mode === 0 ? 'bg-blue-600/20 border-blue-500' : 'bg-gray-900 border-gray-700'}`}>
                                                    <input type="radio" name="mode" className="hidden" checked={mode === 0} onChange={() => setMode(0)} />
                                                    <div className="font-bold">无限循环</div>
                                                    <div className="text-xs text-gray-400">直到成功或手动停止</div>
                                                </label>
                                                <label className={`flex-1 cursor-pointer p-4 rounded-lg border ${mode === 1 ? 'bg-blue-600/20 border-blue-500' : 'bg-gray-900 border-gray-700'}`}>
                                                    <input type="radio" name="mode" className="hidden" checked={mode === 1} onChange={() => setMode(1)} />
                                                    <div className="font-bold">有限尝试</div>
                                                    <div className="text-xs text-gray-400">尝试 {totalAttempts} 次后停止</div>
                                                </label>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">原始配置 (JSON)</label>
                                            <textarea
                                                className="w-full h-32 bg-gray-900 border border-gray-700 rounded-lg p-3 font-mono text-xs text-gray-300 focus:border-blue-500 focus:outline-none"
                                                value={ticketInfo}
                                                onChange={(e) => setTicketInfo(e.target.value)}
                                                placeholder='高级用户可直接编辑 JSON...'
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {/* HISTORY TAB */}
                    {
                        activeTab === "history" && (
                            <div className="max-w-5xl mx-auto bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-700">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        <History className="text-green-400" />
                                        抢票记录
                                    </h3>
                                    <div className="flex gap-3">
                                        <button onClick={handleClearHistory} className="text-sm text-red-400 hover:underline flex items-center gap-1">
                                            <Trash2 size={14} /> 清空记录
                                        </button>
                                        <button onClick={loadHistory} className="text-sm text-blue-400 hover:underline flex items-center gap-1">
                                            <RefreshCw size={14} /> 刷新
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-900 text-gray-400">
                                            <tr>
                                                <th className="p-3 rounded-tl-lg">时间</th>
                                                <th className="p-3">项目名称</th>
                                                <th className="p-3">订单号</th>
                                                <th className="p-3">金额</th>
                                                <th className="p-3 rounded-tr-lg">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700">
                                            {history.length === 0 && (
                                                <tr>
                                                    <td colSpan="5" className="p-8 text-center text-gray-500">暂无记录</td>
                                                </tr>
                                            )}
                                            {history.map((item, i) => (
                                                <tr key={i} className="hover:bg-gray-700/50">
                                                    <td className="p-3 text-gray-300">{item.time}</td>
                                                    <td className="p-3 font-medium">{item.project_name || "未知项目"}</td>
                                                    <td className="p-3 font-mono text-xs text-gray-400">{item.order_id}</td>
                                                    <td className="p-3 text-yellow-400">￥{item.price / 100}</td>
                                                    <td className="p-3">
                                                        {item.pay_url ? (
                                                            <a href={item.pay_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                                                                支付链接
                                                            </a>
                                                        ) : (
                                                            <a href="https://show.bilibili.com/platform/order/list" target="_blank" rel="noreferrer" className="text-gray-500 hover:text-white hover:underline">
                                                                订单中心
                                                            </a>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    }

                    {/* SETTINGS TAB */}
                    {activeTab === "settings" && (
                        <div className="max-w-4xl mx-auto bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-700">
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                                <Settings className="text-blue-400" />
                                高级设置
                            </h3>

                            <div className="space-y-8">
                                {/* Time Sync Settings */}
                                <div>
                                    <h4 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">时间同步设置</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">NTP / 时间服务器</label>
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                    placeholder="https://api.bilibili.com/x/report/click/now 或 pool.ntp.org"
                                                    value={ntpServer}
                                                    onChange={(e) => setNtpServer(e.target.value)}
                                                />
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { name: "B站 API", value: "https://api.bilibili.com/x/report/click/now" },
                                                        { name: "淘宝 API", value: "http://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp" },
                                                        { name: "阿里云 NTP", value: "ntp.aliyun.com" },
                                                        { name: "腾讯云 NTP", value: "ntp.tencent.com" },
                                                        { name: "国家授时", value: "ntp.ntsc.ac.cn" }
                                                    ].map((server) => (
                                                        <button
                                                            key={server.name}
                                                            onClick={() => setNtpServer(server.value)}
                                                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-colors border border-gray-600"
                                                        >
                                                            {server.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">支持 HTTP API (如 B站/淘宝) 或 NTP 服务器域名</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">同步间隔 (毫秒，0 = 不自动同步)</label>
                                            <input
                                                type="number"
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                value={syncInterval}
                                                onChange={(e) => setSyncInterval(parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">当前时间偏移 (ms)</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                    value={timeOffset}
                                                    onChange={(e) => updateTimeOffset(e.target.value)}
                                                />
                                                <button
                                                    onClick={() => syncTime(false)}
                                                    disabled={isSyncing}
                                                    className={`bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg font-bold flex items-center gap-2 ${isSyncing ? "opacity-50 cursor-not-allowed" : ""}`}
                                                >
                                                    {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : "立即同步"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Network Settings */}
                                <div>
                                    <h4 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">网络设置</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">代理服务器 (Proxy)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                            placeholder="http://127.0.0.1:7890"
                                            value={proxy}
                                            onChange={(e) => setProxy(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Notification Settings */}
                                <div>
                                    <h4 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">消息推送</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">PushPlus Token</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                    value={notifications.pushplus}
                                                    onChange={(e) => setNotifications({ ...notifications, pushplus: e.target.value })}
                                                />
                                                <button onClick={() => handleTestPush("pushplus")} className="bg-gray-700 hover:bg-gray-600 px-3 rounded-lg text-sm">测试</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">ServerChan Key</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                    value={notifications.serverchan}
                                                    onChange={(e) => setNotifications({ ...notifications, serverchan: e.target.value })}
                                                />
                                                <button onClick={() => handleTestPush("serverchan")} className="bg-gray-700 hover:bg-gray-600 px-3 rounded-lg text-sm">测试</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">Bark URL / Token</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                    value={notifications.bark}
                                                    onChange={(e) => setNotifications({ ...notifications, bark: e.target.value })}
                                                />
                                                <button onClick={() => handleTestPush("bark")} className="bg-gray-700 hover:bg-gray-600 px-3 rounded-lg text-sm">测试</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">Ntfy Topic / URL</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none"
                                                    value={notifications.ntfy}
                                                    onChange={(e) => setNotifications({ ...notifications, ntfy: e.target.value })}
                                                />
                                                <button onClick={() => handleTestPush("ntfy")} className="bg-gray-700 hover:bg-gray-600 px-3 rounded-lg text-sm">测试</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-6 border-t border-gray-700">
                                    <button
                                        onClick={handleSaveSettings}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg transform transition active:scale-95 flex items-center gap-2"
                                    >
                                        <Save size={20} />
                                        保存设置
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* LOGIN TAB (Account Management) */}
                    {
                        activeTab === "login" && (
                            <div className="max-w-4xl mx-auto">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-2xl font-bold">账号管理</h3>
                                    <div className="flex gap-2">
                                        <input
                                            type="file"
                                            ref={cookieFileInputRef}
                                            className="hidden"
                                            accept=".json"
                                            onChange={handleImportCookie}
                                        />
                                        <button
                                            onClick={() => cookieFileInputRef.current?.click()}
                                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold"
                                        >
                                            <Upload size={20} />
                                            导入 Cookie
                                        </button>
                                        <button
                                            onClick={startAddAccount}
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold"
                                        >
                                            <Plus size={20} />
                                            添加账号
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {accounts.map(acc => (
                                        <div key={acc.uid} className={`bg-gray-800 rounded-xl p-6 border transition-all ${userInfo?.mid === acc.uid ? 'border-blue-500 shadow-blue-500/20 shadow-lg' : 'border-gray-700 hover:border-gray-600'}`}>
                                            <div className="flex items-center gap-4 mb-4">
                                                <img src={acc.face} alt={acc.name} className="w-14 h-14 rounded-full border-2 border-gray-600" />
                                                <div className="overflow-hidden">
                                                    <div className="font-bold text-lg truncate">{acc.name}</div>
                                                    <div className="text-xs text-gray-500">UID: {acc.uid}</div>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 mt-4">
                                                <button
                                                    onClick={() => handleUseAccount(acc)}
                                                    disabled={userInfo?.mid === acc.uid}
                                                    className={`flex-1 py-2 rounded-lg text-sm font-bold ${userInfo?.mid === acc.uid ? 'bg-gray-700 text-gray-400 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                                                >
                                                    {userInfo?.mid === acc.uid ? "当前使用" : "切换使用"}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(JSON.stringify(acc.cookies));
                                                        alert("Cookies 已复制到剪贴板");
                                                    }}
                                                    className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
                                                    title="复制 Cookies"
                                                >
                                                    <Copy size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleExportCookie(acc)}
                                                    className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
                                                    title="导出 Cookie"
                                                >
                                                    <Download size={18} />
                                                </button>
                                                <button
                                                    onClick={() => invoke("open_bilibili_home", { cookies: acc.cookies })}
                                                    className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
                                                    title="进入首页 (已登录)"
                                                >
                                                    <ExternalLink size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveAccount(acc.uid)}
                                                    className="p-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg"
                                                    title="删除账号"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {accounts.length === 0 && (
                                        <div className="col-span-full text-center py-12 text-gray-500 bg-gray-800/50 rounded-xl border border-dashed border-gray-700">
                                            暂无账号，请点击右上角添加
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    }

                    {/* ABOUT TAB */}
                    {
                        activeTab === "about" && (
                            <div className="max-w-3xl mx-auto">
                                <div className="bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-700 text-center">
                                    <img src={logo} alt="Logo" className="w-20 h-20 rounded-2xl mx-auto mb-6 shadow-lg shadow-blue-500/20" />
                                    <h2 className="text-3xl font-bold mb-2">B站抢票助手</h2>
                                    <p className="text-gray-400 mb-8">Rust 重构版 v2.1.0</p>

                                    <div className="text-left bg-gray-900/50 p-6 rounded-xl border border-gray-700 mb-8 space-y-4 text-sm text-gray-300 leading-relaxed">
                                        <p>
                                            本项目是基于 <a href="https://github.com/mikumifa/biliTickerBuy" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">mikumifa/biliTickerBuy</a> 的 Rust 重构版本，
                                            理论具有极高并发性能，并实现了账号管理、精确定时、历史记录、任务管理等功能。
                                        </p>
                                        <p>
                                            本项目遵循 MIT License 许可协议，仅供个人学习与研究使用。
                                            <span className="text-red-400 font-bold"> 请勿将本项目用于任何商业牟利行为，亦严禁用于任何形式的付费代抢、违法行为或违反相关平台规则的用途。</span>
                                            由此产生的一切后果均由使用者自行承担，与本人无关。
                                        </p>
                                        <p>
                                            若您 fork 或使用本项目，请务必遵守相关法律法规与目标平台规则。
                                        </p>
                                    </div>

                                    <div className="flex justify-center gap-4">
                                        <a
                                            href="https://github.com/NekoMirra/biliTickerBuy"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-bold transition-all hover:scale-105"
                                        >
                                            <Github size={20} />
                                            GitHub 项目主页
                                        </a>
                                    </div>

                                    <div className="mt-8 text-xs text-gray-500">
                                        by NekoMirra
                                    </div>
                                </div>
                            </div>
                        )
                    }

                </main >

                {/* Login Modal */}
                {
                    showLoginModal && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="bg-gray-800 rounded-xl p-8 shadow-2xl border border-gray-700 text-center max-w-md w-full relative">
                                <button
                                    onClick={() => setShowLoginModal(false)}
                                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                                >
                                    <X size={24} />
                                </button>

                                <h3 className="text-2xl font-bold mb-6">扫码登录</h3>

                                <div className="bg-white p-4 rounded-lg inline-block mb-6 min-h-[200px] min-w-[200px] flex items-center justify-center">
                                    {qrCodeUrl ? (
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}`} alt="Login QR" />
                                    ) : (
                                        <div className="text-gray-400 text-sm">正在获取二维码...</div>
                                    )}
                                </div>

                                <p className={`text-sm font-bold mb-6 ${loginStatus.includes("成功") ? "text-green-400" : "text-yellow-400"}`}>
                                    {loginStatus || "请使用B站App扫描二维码"}
                                </p>
                            </div>
                        </div>
                    )
                }
            </div >
        </div >
    );
}

export default App;
