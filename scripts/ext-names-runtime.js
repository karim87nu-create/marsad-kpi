// The name rules of extension-3/names.js (read by scripts/build-ext-names.mjs; NAMES, SKEL and skeleton() come before it).
  // «Abd …» names (Karim 11-19: «عبد راهيم», «عبد فتاه», «عبد كريم») and «… Eldin» (Saadeldin → سعد الدين).
  const ABD = { rahman: 'رحمن', rahmn: 'رحمن', rhman: 'رحمن', rahim: 'رحيم', raheem: 'رحيم', rehim: 'رحيم', fattah: 'فتاح', fatah: 'فتاح', fatta: 'فتاح', karim: 'كريم', kareem: 'كريم', krim: 'كريم',
    aziz: 'عزيز', azeez: 'عزيز', hamid: 'حميد', hameed: 'حميد', moneim: 'منعم', monem: 'منعم', moniem: 'منعم', salam: 'سلام', salaam: 'سلام', latif: 'لطيف', lateef: 'لطيف', ghani: 'غني', ghany: 'غني',
    hady: 'هادي', hadi: 'هادي', nasser: 'ناصر', naser: 'ناصر', wahab: 'وهاب', wahhab: 'وهاب', razek: 'رازق', razik: 'رازق', razik2: 'رازق', maksoud: 'مقصود', maqsoud: 'مقصود', halim: 'حليم', haleem: 'حليم',
    majid: 'مجيد', mageed: 'مجيد', magid: 'مجيد', kader: 'قادر', qader: 'قادر', kadir: 'قادر', gawad: 'جواد', gwad: 'جواد', jawad: 'جواد', alim: 'عليم', aleem: 'عليم', sattar: 'ستار', satar: 'ستار',
    mohsen: 'محسن', muhsin: 'محسن', aal: 'عال', aty: 'عاطي', ati: 'عاطي', baky: 'باقي', baki: 'باقي', basset: 'باسط', baset: 'باسط', basit: 'باسط', tawab: 'تواب', tawwab: 'تواب', raouf: 'رؤوف', rauf: 'رؤوف',
    malek: 'مالك', malik: 'مالك', khalek: 'خالق', khaliq: 'خالق', hakim: 'حكيم', hakeem: 'حكيم', samad: 'صمد', azim: 'عظيم', azeem: 'عظيم', galil: 'جليل', jalil: 'جليل', gaber: 'جابر', jaber: 'جابر',
    wahed: 'واحد', razzak: 'رزاق', razak: 'رزاق', ilah: 'إله', elah: 'إله', mawla: 'مولى', mooty: 'معطي', moaty: 'معطي', moati: 'معطي', mottaleb: 'مطلب', motaleb: 'مطلب', muttalib: 'مطلب', hay: 'حي', hai: 'حي',
    nour: 'نور', noor: 'نور', saboor: 'صبور', sabour: 'صبور', shafy: 'شافي', shafi: 'شافي', wanis: 'ونيس', fadil: 'فضيل', mageid: 'مجيد', allah: 'الله' };
  const DIN = /^(?:el|al|ul|ed|ud|e|u)?-?d[eiy]+n$/;
  const PLACEHOLDER = /^(?:unknown|n\/?a|none|null|guest|customer|talabat( customer)?|-+|\.+|x+)$/i;
  const one = x => NAMES[x] || (x.length >= 3 ? SKEL[skeleton(x)] : null);
  const bare = v => String(v || '').replace(/^ال/, '');
  globalThis.MARSAD_NAME = name => {
    const raw = String(name || '').replace(/\s+/g, ' ').trim();
    if (!raw || PLACEHOLDER.test(raw) || !/[a-z؀-ۿ]/i.test(raw)) return '';   // «?? ?», emoji-only: no name
    const ws = raw.split(' ').filter(w => !/^[a-z]\.?$/i.test(w));                        // «H Ibrahim», «Ashraf m»: a lone letter goes
    if (!ws.length) return '';
    const out = [];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i], k = w.toLowerCase().replace(/['’`]/g, '');
      if (!/^[a-z0-9'’`\-]+$/i.test(w)) { out.push(w); continue; }
      const nk = (ws[i + 1] || '').toLowerCase().replace(/['’`]/g, ''), nk2 = (ws[i + 2] || '').toLowerCase().replace(/['’`]/g, '');
      // «Abd Rahim», «Abdel Rahman», «Abd El Fattah»
      if (/^abd(?:el|ul|al|ol)?$/.test(k)) {
        if (/^(el|al)$/.test(nk) && ABD[nk2]) { out.push('عبد' + (ABD[nk2] === 'الله' ? 'الله' : 'ال' + ABD[nk2])); i += 2; continue; }
        if (ABD[nk]) { out.push('عبد' + (ABD[nk] === 'الله' ? 'الله' : 'ال' + ABD[nk])); i += 1; continue; }
      }
      // «Abdelrahim», «Abdulfattah» in one word
      const ab = !NAMES[k] && k.match(/^abd(?:el|ul|al|ol)?-?([a-z]{3,})$/);
      if (ab && ABD[ab[1]]) { out.push('عبد' + (ABD[ab[1]] === 'الله' ? 'الله' : 'ال' + ABD[ab[1]])); continue; }
      // «Salah Eldin», «Nour El Din», «Saadeldin»
      if (DIN.test(nk) && one(k)) { out.push(bare(one(k)) + ' الدين'); i += 1; continue; }
      if (/^(el|al)$/.test(nk) && /^d[eiy]+n$/.test(nk2) && one(k)) { out.push(bare(one(k)) + ' الدين'); i += 2; continue; }
      const dn = !NAMES[k] && k.match(/^([a-z]{2,}?)(?:el|al|ud|ed|e)d[eiy]+n$/);
      if (dn && one(dn[1])) { out.push(bare(one(dn[1])) + ' الدين'); continue; }
      if (/^(el|al)$/.test(k) || DIN.test(k)) { out.push(w); continue; }   // «El Gazzar»: the server joins «El» to the next word   // «El Gazzar»: the server joins «El» to the next word
      const el = k.match(/^(el|al)-?(.{3,})$/);
      out.push(one(k) || (el && one(el[2]) ? 'ال' + bare(one(el[2])) : null) || w);
    }
    return out.join(' ');
  };
