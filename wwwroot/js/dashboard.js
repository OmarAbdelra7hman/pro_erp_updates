// ProERP Dashboard Chart – ApexCharts via CDN
window.renderDynamicDashboardChart = function (categories, salesData, purchasesData) {
    const el = document.getElementById('dash-chart');
    if (!el || typeof ApexCharts === 'undefined') return;

    if (window.dashChartInstance) {
        window.dashChartInstance.destroy();
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
            { name: 'المبيعات', data: salesData },
            { name: 'المشتريات', data: purchasesData }
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
            categories: categories,
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

    const chart = new ApexCharts(el, options);
    chart.render();
    window.dashChartInstance = chart;
};
