/* Axon redesign — line icon set. Single <Icon name size/> component.
   1.6 stroke, 24-box paths. Exported to window.Icon. */
(function () {
  const P = {
    plus: 'M12 5v14M5 12h14',
    edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z M13.5 6.5l3 3',
    copy: 'M9 9h10v10H9z M5 15V5h10',
    trash: 'M4 7h16 M9 7V5h6v2 M6 7l1 13h10l1-13',
    refresh: 'M20 12a8 8 0 1 1-2.3-5.6 M20 4v3.5h-3.5',
    expand: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
    collapse: 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5',
    hash: 'M9 4 7 20 M17 4l-2 16 M4 9h16 M3.5 15h16',
    layers: 'M12 4 3 9l9 5 9-5-9-5z M3 14l9 5 9-5',
    sep: 'M4 8h16 M4 16h16',
    list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
    basket: 'M5 9h14l-1.2 9.5a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 9z M8.5 9 12 3.5 15.5 9 M9.5 13v3 M14.5 13v3',
    download: 'M12 4v11 M7.5 11l4.5 4 4.5-4 M5 19h14',
    upload: 'M12 16V5 M7.5 9 12 4.5 16.5 9 M5 19h14',
    chevdown: 'M5 9l7 7 7-7',
    chevright: 'M9 5l7 7-7 7',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.5-4.5',
    zin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.5-4.5 M11 8v6 M8 11h6',
    zout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.5-4.5 M8 11h6',
    fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5 M9 9h6v6H9z',
    reset: 'M5 12a7 7 0 1 0 7-7 M12 2 8.5 5 12 8',
    spark: 'M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z',
    lock: 'M6 11h12v9H6z M9 11V8a3 3 0 0 1 6 0v3',
    back: 'M15 5l-7 7 7 7 M8 12h12',
    close: 'M6 6l12 12 M18 6 6 18',
    grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
    print: 'M7 9V4h10v5 M7 17H5v-6h14v6h-2 M8 14h8v6H8z',
    bot: 'M9 13h.01 M15 13h.01 M7 8h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z M12 4v4 M12 3.5h.01 M3 12v3 M21 12v3',
    palette: 'M12 3a9 9 0 1 0 0 18c1.4 0 1.8-1.6 1-2.5-.8-1 0-2.5 1.2-2.5H17a4 4 0 0 0 4-4c0-4.5-4-9-9-9z M7.5 12h.01 M10 8h.01 M14.5 8h.01',
    filter: 'M4 5h16l-6 7v5l-4 2v-7L4 5z',
    check: 'M4 12l5 5L20 6',
    sun: 'M12 4V2 M12 22v-2 M5 5L3.6 3.6 M20.4 20.4 19 19 M4 12H2 M22 12h-2 M5 19l-1.4 1.4 M20.4 3.6 19 5 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    moon: 'M20 13.5A8 8 0 1 1 10.5 4 6.2 6.2 0 0 0 20 13.5z',
    corner: 'M9 7l-5 5 5 5 M4 12h11a4 4 0 0 0 4-4V5',
    merge: 'M6 4v5a4 4 0 0 0 4 4h9 M16 9l4 4-4 4 M6 20v-5',
    target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 12h.01',
    grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
    alert: 'M12 3.5L21.5 20H2.5z M12 10v4 M12 17.4h.01',
    branch: 'M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 8v8 M18 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 6c0 6-12 3-12 10',
    barcode: 'M4 5v14 M7 5v11 M9.5 5v14 M12 5v11 M14.5 5v14 M17 5v11 M20 5v14',
    scan: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M4 12h16',
  };
  function Icon({ name, size = 16, style }) {
    const d = P[name] || '';
    return React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round',
      strokeLinejoin: 'round', style,
    }, d.split(' M').map((seg, i) =>
      React.createElement('path', { key: i, d: (i ? 'M' : '') + seg })));
  }
  window.Icon = Icon;
})();
