// js/charts.js — Line + overlay charts

function cln(a){return a.map(function(v){return v==null?NaN:v})}

var Charts = {
    inst: {},
    PAL: {
        price:'#e2e8f0',   priceG1:'rgba(226,232,240,0.12)', priceG2:'rgba(226,232,240,0)',
        up:'#22c55e', dn:'#ef4444', upA:'rgba(34,197,94,0.65)', dnA:'rgba(239,68,68,0.65)',
        ema9:'#facc15',     ema21:'#f97316',    ema50:'#a78bfa',
        bb:'rgba(148,163,184,0.45)', bbF:'rgba(148,163,184,0.04)',
        sup:'#34d399', res:'#f87171', volAvg:'#fbbf24',
        rsi:'#f59e0b', rsiLine:'#f59e0b',
        macdL:'#22d3ee', macdS:'#fb923c',
        grid:'rgba(255,255,255,0.04)', tick:'#8899aa',
        eq:'#34d399'
    },

    destroyAll: function(){Object.keys(this.inst).forEach(function(k){Charts.inst[k].destroy()});this.inst={}},

    defaults: function(){
        Chart.defaults.color=this.PAL.tick; Chart.defaults.borderColor=this.PAL.grid;
        Chart.defaults.font.family="'Inter',sans-serif"; Chart.defaults.font.size=11;
        Chart.defaults.animation.duration=400;
    },

    timeUnit: function(dates){
        if(dates.length<2)return'day';
        var d=(dates[dates.length-1]-dates[0])/864e5;
        return d<=45?'day':d<=120?'week':'month';
    },

    tip:function(){return{mode:'index',intersect:false,backgroundColor:'rgba(15,18,25,0.95)',titleColor:'#e2e8f0',bodyColor:'#cbd5e1',borderColor:'#334155',borderWidth:1,padding:12,cornerRadius:8,bodyFont:{family:"'JetBrains Mono',monospace",size:11},displayColors:true,boxWidth:10,boxHeight:10,filter:function(i){return!isNaN(i.raw)}}},

    xS:function(dates,show){return{type:'time',time:{unit:this.timeUnit(dates),tooltipFormat:'MMM d, yyyy'},display:show!==false,grid:{display:false},ticks:{maxTicksLimit:10,font:{size:10}},border:{display:false}}},

    yS:function(o){o=o||{};return{position:'right',grid:{color:this.PAL.grid,drawBorder:false},ticks:{padding:8,font:{size:10,family:"'JetBrains Mono',monospace"},callback:o.fmt||undefined},border:{display:false},min:o.min,max:o.max}},

    grad:function(ctx,c1,c2,h){var g=ctx.createLinearGradient(0,0,0,h||400);g.addColorStop(0,c1);g.addColorStop(1,c2);return g},

    /** Custom candlestick plugin */
    candlePlugin: {
        id:'candles',
        afterDatasetsDraw:function(chart){
            var ohlc = chart.options.plugins.candles && chart.options.plugins.candles.ohlcData;
            if(!ohlc)return;
            var ctx=chart.ctx, xA=chart.scales.x, yA=chart.scales.y;
            var bw = Math.max(2, Math.min(12, (xA.width / ohlc.length) * 0.55));
            for(var i=0;i<ohlc.length;i++){
                var d=ohlc[i], x=xA.getPixelForValue(d.time);
                if(x<xA.left||x>xA.right)continue;
                var oY=yA.getPixelForValue(d.open), cY=yA.getPixelForValue(d.close);
                var hY=yA.getPixelForValue(d.high), lY=yA.getPixelForValue(d.low);
                var up=d.close>=d.open;
                ctx.strokeStyle=up?Charts.PAL.up:Charts.PAL.dn;
                ctx.fillStyle=up?Charts.PAL.up:Charts.PAL.dn;
                // Wick
                ctx.beginPath();ctx.moveTo(x,hY);ctx.lineTo(x,lY);ctx.lineWidth=1;ctx.stroke();
                // Body
                var top=Math.min(oY,cY), h=Math.abs(cY-oY)||1;
                ctx.fillRect(x-bw/2,top,bw,h);
            }
        }
    },

    crosshairPlugin: {
        id:'crosshair',
        afterDraw:function(chart){
            var tt=chart.tooltip;
            if(tt&&tt._active&&tt._active.length){
                var x=tt._active[0].element.x,ctx=chart.ctx,a=chart.chartArea;
                ctx.save();ctx.beginPath();ctx.moveTo(x,a.top);ctx.lineTo(x,a.bottom);
                ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.setLineDash([4,3]);ctx.stroke();ctx.restore();
            }
        }
    },

    renderAll:function(comp,range){
        this.destroyAll();this.defaults();
        if(!comp||!comp.data||!comp.data.length)return;
        var d=comp.data, dates=d.map(function(x){return x.time});
        try{this.renderPrice(dates,d,comp)}catch(e){console.error('[Charts] Price:',e)}
        try{this.renderVolume(dates,d,comp)}catch(e){console.error('[Charts] Volume:',e)}
        try{this.renderRSI(dates,comp.rsi||[])}catch(e){console.error('[Charts] RSI:',e)}
        try{this.renderMACD(dates,comp.macd||{line:[],signal:[],hist:[]})}catch(e){console.error('[Charts] MACD:',e)}
    },

    renderPrice:function(dates,data,comp){
        var ctx=document.getElementById('priceChart').getContext('2d');
        // Compute y range from close prices
        var mn=Infinity,mx=-Infinity;
        for(var i=0;i<data.length;i++){if(data[i].low<mn)mn=data[i].low;if(data[i].high>mx)mx=data[i].high;}
        var pad=(mx-mn)*0.03; mn-=pad; mx+=pad;

        var closes=data.map(function(d){return d.close});
        var grad=this.grad(ctx,this.PAL.priceG1,this.PAL.priceG2,350);
        var ds=[
            {label:'TQQQ',data:closes,borderColor:this.PAL.price,borderWidth:2.2,pointRadius:0,pointHitRadius:8,fill:true,backgroundColor:grad,tension:0.1,order:1},
            {label:'EMA 9',data:cln(comp.ema9),borderColor:this.PAL.ema9,borderWidth:1.4,pointRadius:0,spanGaps:false,order:2},
            {label:'EMA 21',data:cln(comp.ema21),borderColor:this.PAL.ema21,borderWidth:1.4,pointRadius:0,spanGaps:false,order:3},
            {label:'EMA 50',data:cln(comp.ema50),borderColor:this.PAL.ema50,borderWidth:1.4,borderDash:[6,3],pointRadius:0,spanGaps:false,order:4},
            {label:'BB Upper',data:cln(comp.bb.upper),borderColor:this.PAL.bb,borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false,spanGaps:false,order:5},
            {label:'BB Lower',data:cln(comp.bb.lower),borderColor:this.PAL.bb,borderWidth:1,borderDash:[4,4],pointRadius:0,fill:'-1',backgroundColor:this.PAL.bbF,spanGaps:false,order:6}
        ];
        var sr=comp.sr;
        if(sr.support!=null)ds.push({label:'Support',data:new Array(dates.length).fill(sr.support),borderColor:this.PAL.sup,borderWidth:1.5,borderDash:[10,5],pointRadius:0,order:7});
        if(sr.resistance!=null)ds.push({label:'Resistance',data:new Array(dates.length).fill(sr.resistance),borderColor:this.PAL.res,borderWidth:1.5,borderDash:[10,5],pointRadius:0,order:8});

        this.inst.price=new Chart(ctx,{
            type:'line',data:{labels:dates,datasets:ds},
            options:{
                responsive:true,maintainAspectRatio:false,
                interaction:{mode:'index',intersect:false},
                plugins:{
                    legend:{display:true,position:'top',labels:{usePointStyle:true,pointStyle:'line',boxWidth:16,padding:12,color:'#94a3b8',font:{size:10},filter:function(i,chartData){var ds=chartData.datasets[i.datasetIndex];if(!ds||!ds.data||!ds.data.length)return false;for(var k=ds.data.length-1;k>=0;k--)if(ds.data[k]!=null&&!isNaN(ds.data[k]))return true;return false}}},
                    tooltip:this.tip()
                },
                scales:{x:this.xS(dates,true),y:this.yS({min:mn,max:mx,fmt:function(v){return'$'+v.toFixed(2)}})}
            },
            plugins:[this.crosshairPlugin]
        });
        this._bindToggles();
    },

    _bindToggles:function(){
        var ch=this.inst.price; if(!ch)return;
        document.querySelectorAll('.ch-toggles input').forEach(function(cb){
            var cl=cb.cloneNode(true);cb.parentNode.replaceChild(cl,cb);
            cl.addEventListener('change',function(){
                var l=this.dataset.layer,h=!this.checked,ds=ch.data.datasets;
                if(l==='ema')for(var i=1;i<=3;i++)if(ds[i])ds[i].hidden=h;
                if(l==='bb')for(var i=4;i<=5;i++)if(ds[i])ds[i].hidden=h;
                if(l==='sr')for(var i=6;i<ds.length;i++)if(ds[i])ds[i].hidden=h;
                ch.update('none');
            });
        });
    },

    renderVolume:function(dates,data,comp){
        var ctx=document.getElementById('volumeChart').getContext('2d');
        var vols=data.map(function(d){return d.volume});
        var cols=data.map(function(d,i){return i===0||d.close>=data[i-1].close?Charts.PAL.upA:Charts.PAL.dnA});
        this.inst.vol=new Chart(ctx,{type:'bar',data:{labels:dates,datasets:[
            {label:'Volume',data:vols,backgroundColor:cols,borderWidth:0,barPercentage:0.8,order:2},
            {label:'20d Avg',data:cln(comp.vol20),type:'line',borderColor:this.PAL.volAvg,borderWidth:1.8,pointRadius:0,spanGaps:false,order:1}
        ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:this.tip()},scales:{x:this.xS(dates,false),y:this.yS({fmt:function(v){return fmtVolume(v)}})}},plugins:[this.crosshairPlugin]});
    },

    renderRSI:function(dates,rsi){
        var ctx=document.getElementById('rsiChart').getContext('2d');
        var n=dates.length,l70=new Array(n).fill(70),l30=new Array(n).fill(30),l50=new Array(n).fill(50);
        this.inst.rsi=new Chart(ctx,{type:'line',data:{labels:dates,datasets:[
            {label:'OB',data:l70,borderColor:'transparent',backgroundColor:'rgba(244,67,54,0.08)',fill:{target:{value:100}},pointRadius:0,order:5},
            {label:'OS',data:l30,borderColor:'transparent',backgroundColor:'rgba(76,175,80,0.08)',fill:{target:{value:0}},pointRadius:0,order:5},
            {label:'70',data:l70,borderColor:'rgba(244,67,54,0.45)',borderWidth:1,borderDash:[5,4],pointRadius:0,fill:false,order:3},
            {label:'50',data:l50,borderColor:'rgba(255,255,255,0.08)',borderWidth:1,pointRadius:0,fill:false,order:4},
            {label:'30',data:l30,borderColor:'rgba(76,175,80,0.45)',borderWidth:1,borderDash:[5,4],pointRadius:0,fill:false,order:3},
            {label:'RSI',data:cln(rsi),borderColor:this.PAL.rsi,borderWidth:2.2,pointRadius:0,spanGaps:false,order:1}
        ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:Object.assign(this.tip(),{filter:function(i){return i.datasetIndex===5}})},scales:{x:this.xS(dates,false),y:this.yS({min:0,max:100})}},plugins:[this.crosshairPlugin]});
    },

    renderMACD:function(dates,macd){
        var ctx=document.getElementById('macdChart').getContext('2d');
        var hc=macd.hist.map(function(v){return v>=0?Charts.PAL.upA:Charts.PAL.dnA});
        this.inst.macd=new Chart(ctx,{type:'line',data:{labels:dates,datasets:[
            {label:'Hist',data:cln(macd.hist),type:'bar',backgroundColor:hc,borderWidth:0,barPercentage:0.7,order:3},
            {label:'MACD',data:cln(macd.line),borderColor:this.PAL.macdL,borderWidth:2,pointRadius:0,spanGaps:false,order:1},
            {label:'Signal',data:cln(macd.signal),borderColor:this.PAL.macdS,borderWidth:1.8,borderDash:[4,3],pointRadius:0,spanGaps:false,order:2},
            {label:'Zero',data:new Array(dates.length).fill(0),borderColor:'rgba(255,255,255,0.1)',borderWidth:1,pointRadius:0,order:4}
        ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:Object.assign(this.tip(),{filter:function(i){return i.datasetIndex<=2}})},scales:{x:this.xS(dates,false),y:this.yS()}},plugins:[this.crosshairPlugin]});
    },

    renderEquity:function(eq){
        var el=document.getElementById('equityChart');if(!el)return;
        var ctx=el.getContext('2d');if(this.inst.eq)this.inst.eq.destroy();
        var gr=this.grad(ctx,'rgba(105,240,174,0.18)','rgba(105,240,174,0)',120);
        this.inst.eq=new Chart(ctx,{type:'line',data:{labels:eq.map(function(_,i){return i}),datasets:[{data:eq,borderColor:this.PAL.eq,borderWidth:1.5,backgroundColor:gr,fill:true,pointRadius:0,tension:0.15}]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{position:'right',grid:{color:this.PAL.grid},border:{display:false},ticks:{font:{size:10},callback:function(v){return'$'+(v/1000).toFixed(1)+'k'}}}}}});
    }
};
