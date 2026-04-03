

// 主题切换相关功能
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeDropdown = document.getElementById('themeDropdown');
    const themeSwitch = themeToggle?.closest('.theme-switch');
    const savedTheme = localStorage.getItem('theme') || 'auto';
    if (!themeToggle || !themeDropdown || !themeSwitch) {
        return;
    }
    
    // 设置初始主题
    setTheme(savedTheme);
    
    // 切换下拉菜单显示
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        themeDropdown.classList.toggle('show');
    });
    
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (!themeSwitch.contains(e.target)) {
            themeDropdown.classList.remove('show');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            themeDropdown.classList.remove('show');
        }
    });
    
    // 主题选项点击事件
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const theme = e.currentTarget.dataset.theme;
            setTheme(theme);
            localStorage.setItem('theme', theme);
            themeDropdown.classList.remove('show');
        });
    });
}

function setTheme(theme) {
    // 更新主题和状态栏颜色的函数
    const updateThemeAndStatusBar = (isDark) => {
        const currentTheme = isDark ? 'dark' : 'light';
        const statusBarColor = isDark ? '#121318' : '#f7f9fd';
        document.documentElement.setAttribute('data-theme', currentTheme);
        document.querySelector('meta[name="theme-color"]').setAttribute('content', statusBarColor);
    };
    if (theme === 'auto') {
        // 检查系统主题
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        updateThemeAndStatusBar(darkModeMediaQuery.matches);
        
        // 监听系统主题变化
        darkModeMediaQuery.addEventListener('change', e => {
            updateThemeAndStatusBar(e.matches);
        });
    } else {
        updateThemeAndStatusBar(theme === 'dark');
    }
}
