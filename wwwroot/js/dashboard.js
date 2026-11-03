// Load the chart engine only on the dashboard. It is the largest startup script
// and is not needed by attendance, invoices, or most other screens.
let _apexChartsLoadPromise = null;
// Keep every day in the data, but only label a readable subset of the axis.
function dashboardDateLabelFormatter(categories, maxLabels) {
    const stride = Math.max(1, Math.ceil((categories.length - 1) / (maxLabels - 1)));
    const visible = new Set(categories.filter((_, index) =>
        index === categories.length - 1 || (index % stride === 0 &&
            (index === 0 || categories.length - 1 - index >= stride / 2))));
    return value => visible.has(String(value)) ? value : '';
}
window.updateDashboardTheme = function () {
    if (!window._dashChart || !document.getElementById('dash-chart')) return;
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    const text = light ? '#526174' : '#b5b5b5';
    window._dashChart.updateOptions({
        chart: { foreColor: text },
        theme: { mode: light ? 'light' : 'dark' },
        colors: [light ? '#4555d4' : '#a6b2ff', light ? '#64748b' : '#aaaaaa'],
        grid: { borderColor: light ? '#dce2ea' : '#3a3a3a' },
        xaxis: { labels: { style: { colors: text } } },
        yaxis: { labels: { style: { colors: text } } },
        legend: { labels: { colors: text } },
        tooltip: { theme: light ? 'light' : 'dark' }
    }, false, false);
};
function ensureApexChartsLoaded() {
    if (typeof window.ApexCharts !== 'undefined') return Promise.resolve();
    if (_apexChartsLoadPromise) return _apexChartsLoadPromise;

    _apexChartsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/js/apexcharts.min.js?v=20260630.1';
        script.onload = resolve;
        script.onerror = () => reject(new Error('ApexCharts failed to load'));
        document.head.appendChild(script);
    });
    return _apexChartsLoadPromise;
}

window.renderDynamicDashboardChart = async function (categories, salesData, purchasesData) {
    const el = document.getElementById('dash-chart');
    if (!el) return;

    try {
        await ensureApexChartsLoaded();
        if (window._dashChart) {
            window._dashChart.destroy();
        }

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#526174' : '#b5b5b5';
        const borderColor = isLight ? '#dce2ea' : '#3a3a3a';
        const dates = categories || [];
        const formatAmount = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
        const options = {
            chart: {
                type: 'bar',
                height: 250,
                background: 'transparent',
                foreColor: textColor,
                fontFamily: 'Tajawal, sans-serif',
                toolbar: { show: false },
                zoom: { enabled: false },
                animations: {
                    enabled: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
                    easing: 'easeinout',
                    speed: 250
                }
            },
            theme: { mode: isLight ? 'light' : 'dark' },
            series: [
                { name: 'المبيعات', data: salesData || [0,0,0,0,0,0] },
                { name: 'المشتريات', data: purchasesData || [0,0,0,0,0,0] }
            ],
            colors: [isLight ? '#4555d4' : '#a6b2ff', isLight ? '#64748b' : '#aaaaaa'],
            plotOptions: {
                bar: { horizontal: false, columnWidth: '65%', borderRadius: 2, hideZeroBarsWhenGrouped: true }
            },
            stroke: { show: false, width: 0 },
            fill: {
                type: 'solid',
                opacity: 1
            },
            grid: {
                borderColor: borderColor,
                strokeDashArray: 4
            },
            xaxis: {
                categories: dates,
                axisTicks: { show: false },
                axisBorder: { show: false },
                tooltip: { enabled: false },
                labels: {
                    rotate: 0,
                    rotateAlways: false,
                    hideOverlappingLabels: true,
                    trim: false,
                    formatter: dashboardDateLabelFormatter(dates, 10),
                    style: { fontFamily: 'Tajawal, sans-serif', colors: textColor, fontSize: '11px' }
                }
            },
            yaxis: {
                tickAmount: 4,
                labels: { formatter: formatAmount, style: { fontFamily: 'Tajawal, sans-serif', colors: textColor } }
            },
            tooltip: {
                shared: true,
                intersect: false,
                theme: isLight ? 'light' : 'dark',
                y: { formatter: formatAmount },
                style: { fontFamily: 'Tajawal, sans-serif' }
            },
            legend: {
                position: 'top',
                fontFamily: 'Tajawal, sans-serif',
                labels: { colors: textColor }
            },
            dataLabels: { enabled: false },
            markers: { size: 0, hover: { size: 0 } },
            responsive: [{
                breakpoint: 640,
                options: {
                    xaxis: { labels: { formatter: dashboardDateLabelFormatter(dates, 6) } },
                    legend: { fontSize: '12px', itemMargin: { horizontal: 10 } }
                }
            }]
        };

        window._dashChart = new ApexCharts(el, options);
        await window._dashChart.render();
    } catch (err) {
        el.innerHTML = '<div style="color:red; padding:20px;">حدث خطأ أثناء الرسم: ' + err.message + '</div>';
    }
};
