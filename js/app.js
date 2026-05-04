// js/app.js — Main controller

var App = {
    range: '6mo', computed: null, chartSlice: null, lastSig: null, usdInr: 83, vixData: null,
    refreshTimer: null, countdownTimer: null, countdownSec: 0,

    BARS: {'1mo':22,'3mo':63,'6mo':126,'1y':252,'2y':504},
    FETCH: {'1mo':'1y','3mo':'1y','6mo':'1y','1y':'2y','2y':'5y'},

    init: function(){this.bind();this.load()},

    bind: function(){
        var S=this;
        document.getElementById('refreshBtn').addEventListener('click',function(){S.load()});
        document.querySelectorAll('.tf').forEach(function(b){
            b.addEventListener('click',function(){
                document.querySelectorAll('.tf').forEach(function(x){x.classList.remove('active')});
                this.classList.add('active'); S.range=this.dataset.range; S.load();
            });
        });
        document.getElementById('errRetry').addEventListener('click',function(){document.getElementById('errorOvl').classList.add('hidden');S.load()});
        document.getElementById('errCache').addEventListener('click',function(){document.getElementById('errorOvl').classList.add('hidden')});
        document.getElementById('exportBtn').addEventListener('click',function(){S.exportCSV()});

        // Auto-refresh
        document.getElementById('autoRefresh').addEventListener('change',function(){S.setupAutoRefresh(parseInt(this.value))});
    },

    setupAutoRefresh: function(sec){
        clearInterval(this.refreshTimer); clearInterval(this.countdownTimer);
        this.countdownSec=0;
        var cdEl=document.getElementById('countdown');
        if(!sec){cdEl.textContent='—';return}
        this.countdownSec=sec;
        var S=this;
        this.countdownTimer=setInterval(function(){
            S.countdownSec--;
            if(S.countdownSec<=0){S.countdownSec=sec;S.load()}
            var m=Math.floor(S.countdownSec/60),s=S.countdownSec%60;
            cdEl.textContent=m+':'+(s<10?'0':'')+s;
        },1000);
        cdEl.textContent=Math.floor(sec/60)+':00';
    },

    load: async function(){
        var btn=document.getElementById('refreshBtn');
        btn.classList.add('spinning');btn.disabled=true;
        try{
            var p=await DataAPI.loadAll(this.FETCH[this.range]||'1y');
            this.usdInr=p.usdInr||83; this.vixData=p.vix;
            this.process(p);
            document.getElementById('errorOvl').classList.add('hidden');
        }catch(e){
            console.error('[App]',e);
            document.getElementById('errMsg').textContent=e.message||'Unable to reach data providers.';
            document.getElementById('errorOvl').classList.remove('hidden');
        }finally{btn.classList.remove('spinning');btn.disabled=false}
    },

    process: function(p){
        if(!p.tqqq||p.tqqq.length<30)return;
        var tqqq=p.tqqq;

        this.computed=Strategy.computeAll(tqqq,p.qqq);
        this.lastSig=Strategy.evaluate(this.computed,undefined,p.vix);

        // Slice for charts
        var bars=this.BARS[this.range]||tqqq.length;
        var s=Math.max(0,tqqq.length-bars);
        this.chartSlice={
            data:this.computed.data.slice(s), rsi:this.computed.rsi.slice(s),
            macd:{line:this.computed.macd.line.slice(s),signal:this.computed.macd.signal.slice(s),hist:this.computed.macd.hist.slice(s)},
            bb:{mid:this.computed.bb.mid.slice(s),upper:this.computed.bb.upper.slice(s),lower:this.computed.bb.lower.slice(s)},
            ema9:this.computed.ema9.slice(s),ema21:this.computed.ema21.slice(s),ema50:this.computed.ema50.slice(s),
            atr:this.computed.atr.slice(s),stoch:{k:this.computed.stoch.k.slice(s),d:this.computed.stoch.d.slice(s)},
            vol20:this.computed.vol20.slice(s),
            sr:Ind.supportResistance(this.computed.data.slice(s),20),
            w52:this.computed.w52,pattern:this.computed.pattern,relStr:this.computed.relStr
        };

        this.renderHeader(tqqq,p.vix,p.fetchedAt);
        this.renderSignal(this.lastSig);
        this.renderFearGreed();
        this.renderContext();
        this.renderAlerts();
        this.renderIndicators(this.lastSig.components);
        this.renderBacktest();
        Charts.renderAll(this.chartSlice,this.range);
    },

    renderHeader: function(data,vix,ts){
        var l=data[data.length-1],pr=data[data.length-2];
        var d=l.close-pr.close,pct=d/pr.close*100,up=d>=0;
        document.getElementById('livePrice').textContent=fmtUSD(l.close);
        var ce=document.getElementById('priceChg');ce.textContent=(up?'+':'')+fmtUSD(d);ce.className='mono '+(up?'grn':'red');
        var pe=document.getElementById('pctChg');pe.textContent='('+(up?'+':'')+fmtNum(pct)+'%)';pe.className='mono '+(up?'grn':'red');
        document.getElementById('lastUpd').textContent='Updated: '+toIST(ts);
        if(vix&&vix.length){
            var v=vix[vix.length-1].close,ve=document.getElementById('vixChip');
            ve.textContent='VIX '+fmtNum(v,1);
            ve.style.color=v>25?'var(--red)':v<15?'var(--grn)':'var(--amb)';
        }
    },

    renderSignal: function(sig){
        var card=document.getElementById('sigCard');
        card.className=card.className.replace(/sig-\S+/g,'').trim();
        card.classList.add('card','card-sig');
        if(sig.score>=80)card.classList.add('sig-strong-buy');
        else if(sig.score>=65)card.classList.add('sig-buy');
        else if(sig.score>=50)card.classList.add('sig-wait');
        else if(sig.score>=35)card.classList.add('sig-caution');
        else card.classList.add('sig-avoid');

        var ring=document.getElementById('ringFg'),circ=2*Math.PI*38;
        ring.style.strokeDashoffset=circ-(circ*sig.score/100);
        var col=sig.score>=65?'var(--grn)':sig.score>=50?'var(--amb)':'var(--red)';
        ring.style.stroke=col;
        document.getElementById('scoreVal').textContent=sig.score;
        document.getElementById('scoreVal').style.color=col;
        document.getElementById('sigLbl').textContent=sig.label;
        document.getElementById('sigReason').textContent=sig.reason;
        document.getElementById('sigSub').textContent=
            sig.score>=65?'Conditions favor a swing entry.':
            sig.score>=50?'Mixed — monitor for improvement.':
            'Risk outweighs reward at current levels.';
    },

    renderFearGreed: function(){
        var fg=Strategy.fearGreed(this.computed,this.vixData);
        document.getElementById('fgScore').textContent=fg.score;
        document.getElementById('fgScore').style.color=fg.color;
        document.getElementById('fgText').textContent=fg.label;
        // Rotate needle: 0=left(-90°), 50=center(0°), 100=right(+90°)
        var angle=-90+(fg.score/100)*180;
        document.getElementById('fgNeedle').setAttribute('transform','rotate('+angle+',100,100)');
    },

    renderContext: function(){
        var w=this.computed.w52;
        document.getElementById('ctx52h').textContent=w?fmtUSD(w.high):'—';
        document.getElementById('ctx52l').textContent=w?fmtUSD(w.low):'—';
        var a=this.computed.atr[this.computed.data.length-1];
        document.getElementById('ctxAtr').textContent=a!=null?fmtNum(a):'—';
        var p=this.computed.pattern,el=document.getElementById('ctxPat');
        if(p){el.textContent=p.name+' ('+p.bias+')';el.style.color=p.bias==='BULLISH'?'var(--grn)':p.bias==='BEARISH'?'var(--red)':'var(--t2)'}
        else{el.textContent='None detected';el.style.color='var(--t3)'}
    },

    renderAlerts: function(){
        var alerts=Strategy.detectCrossovers(this.computed);
        var el=document.getElementById('alertsList');
        var html='';
        for(var i=0;i<alerts.length;i++){
            var a=alerts[i],cls=a.type==='bull'?'alert-bull':a.type==='bear'?'alert-bear':'alert-info';
            html+='<div class="alert-item '+cls+'"><span>'+a.text+'</span></div>';
        }
        el.innerHTML=html;
    },

    renderIndicators: function(comps){
        var tb=document.getElementById('indTbody'),h='';
        for(var i=0;i<comps.length;i++){
            var c=comps[i],cls=c.lbl==='BUY'?'vote-buy':c.lbl==='SELL'?'vote-sell':'vote-neutral';
            h+='<tr><td>'+c.name+'</td><td class="mono">'+c.val+'</td><td><span class="vote-pill '+cls+'">'+c.lbl+'</span></td><td class="mono" style="color:var(--t3)">'+c.w+'</td></tr>';
        }
        tb.innerHTML=h;
    },

    renderBacktest: function(){
        if(!this.computed)return;
        var bt=Strategy.backtest(this.computed),s=bt.stats;
        document.getElementById('btTrades').textContent=s.total;
        document.getElementById('btWin').textContent=fmtNum(s.winRate,1)+'%';
        document.getElementById('btAvgW').textContent='+'+fmtNum(s.avgWin,1)+'%';
        document.getElementById('btAvgL').textContent='-'+fmtNum(s.avgLoss,1)+'%';
        document.getElementById('btPF').textContent=fmtNum(s.pf,2);
        document.getElementById('btDD').textContent=fmtNum(s.maxDD,1)+'%';
        Charts.renderEquity(bt.equity);
        // Trade log
        var tb=document.getElementById('logTbody'),h='',trades=bt.trades.slice(-20);
        if(!trades.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--t3)">No trades in backtest window</td></tr>';return}
        for(var i=0;i<trades.length;i++){
            var t=trades[i],pnlPct=(t.pnl*100).toFixed(2),cls=t.pnl>=0?'pnl-pos':'pnl-neg';
            h+='<tr><td>'+(i+1)+'</td><td>'+t.entryDate+'</td><td class="mono">$'+t.entry.toFixed(2)+'</td><td class="mono">$'+t.exit.toFixed(2)+'</td><td>'+t.type+'</td><td class="mono '+cls+'">'+(t.pnl>=0?'+':'')+pnlPct+'%</td></tr>';
        }
        tb.innerHTML=h;
    },

    exportCSV: function(){
        if(!this.lastSig||!this.computed)return;
        var lines=['TQQQ Swing Signal Dashboard — Export','Date,'+new Date().toISOString(),'','=== CURRENT SIGNAL ===','Score,'+this.lastSig.score,'Label,'+this.lastSig.label,'','=== INDICATORS ===','Name,Value,Signal,Weight'];
        var c=this.lastSig.components;
        for(var i=0;i<c.length;i++)lines.push(c[i].name+','+c[i].val+','+c[i].lbl+','+c[i].w);
        lines.push('','=== BACKTEST TRADES ===','#,Entry Date,Entry,Exit,Type,P&L%');
        var bt=Strategy.backtest(this.computed);
        for(var i=0;i<bt.trades.length;i++){
            var t=bt.trades[i];
            lines.push((i+1)+','+t.entryDate+',$'+t.entry.toFixed(2)+',$'+t.exit.toFixed(2)+','+t.type+','+(t.pnl*100).toFixed(2)+'%');
        }
        var blob=new Blob([lines.join('\n')],{type:'text/csv'});
        var a=document.createElement('a');a.href=URL.createObjectURL(blob);
        a.download='tqqq_signal_'+new Date().toISOString().slice(0,10)+'.csv';
        a.click();URL.revokeObjectURL(a.href);
    }
};

document.addEventListener('DOMContentLoaded',function(){App.init()});
