// Load the chart engine only on the dashboard. It is the largest startup script
// and is not needed by attendance, invoices, or most other screens.
let _apexChartsLoadPromise = null;
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

        const options = {
            chart: {
                type: 'area',
                height: 280,
                background: 'transparent',
                foreColor: '#b4bef0',
                fontFamily: 'Tajawal, sans-serif',
                toolbar: { show: false },
                zoom: { enabled: false },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800
                }
            },
            theme: { mode: 'dark' },
            series: [
                { name: 'المبيعات', data: salesData || [0,0,0,0,0,0] },
                { name: 'المشتريات', data: purchasesData || [0,0,0,0,0,0] }
            ],
            colors: ['#5b6cf9', '#00d2c8'],
            stroke: { curve: 'smooth', width: 2 },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 0.5,
                    opacityFrom: 0.35,
                    opacityTo: 0.02,
                    stops: [0, 100]
                }
            },
            grid: {
                borderColor: 'rgba(91,108,249,0.15)',
                strokeDashArray: 4
            },
            xaxis: {
                categories: categories || ['1', '2', '3', '4', '5', '6'],
                labels: { style: { fontFamily: 'Tajawal, sans-serif', colors: '#b4bef0' } }
            },
            yaxis: {
                labels: { style: { fontFamily: 'Tajawal, sans-serif', colors: '#b4bef0' } }
            },
            tooltip: {
                theme: 'dark',
                style: { fontFamily: 'Tajawal, sans-serif' }
            },
            legend: {
                position: 'top',
                fontFamily: 'Tajawal, sans-serif',
                labels: { colors: '#b4bef0' }
            },
            dataLabels: { enabled: false },
            markers: { size: 4, hover: { size: 6 } }
        };

        window._dashChart = new ApexCharts(el, options);
        await window._dashChart.render();
    } catch (err) {
        el.innerHTML = '<div style="color:red; padding:20px;">حدث خطأ أثناء الرسم: ' + err.message + '</div>';
    }
};
