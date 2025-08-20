// Naming helpers for examples and icons

export const generateExampleName = (filename: string): string => {
  const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg|gif|svg)$/i, '');
  const nameWithoutSize = nameWithoutExt.replace(/_\d+x\d+$/, '');
  const map: Record<string, string> = {
    template_1: '模板样式1',
    template_2: '模板样式2',
    template_3: '模板样式3',
    temolate_4: '模板样式4',
    template_5: '模板样式5',
    template_6: '模板样式6',
    template_7: '模板样式7',
    'sample-296x152-text': '文字内容',
    'sample-296x152-landscape': '风景图片',
    gray_296x152: '灰度测试',
    dithered_floyd_steinberg_296x152: '误差扩散',
    dithered_ordered_296x152: '有序抖动',
    dithered_random_296x152: '随机抖动',
  };
  if (nameWithoutSize.startsWith('emoji_')) {
    const emojiNumber = nameWithoutSize.replace('emoji_', '');
    return `表情符号 ${emojiNumber}`;
  }
  return map[nameWithoutSize] || nameWithoutSize;
};

export const generateIconName = (filename: string): string => {
  const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg|gif|svg)$/i, '');
  const nameWithoutSize = nameWithoutExt.replace(/_\d+x\d+$/, '');
  const map: Record<string, string> = {
    add: '添加',
    alarm: '闹钟',
    bookmark: '书签',
    business: '商务',
    camera: '相机',
    cancel: '取消',
    chat: '聊天',
    check: '确认',
    cloud: '云端',
    dashboard: '仪表板',
    delete: '删除',
    download: '下载',
    edit: '编辑',
    email: '邮件',
    error: '错误',
    help: '帮助',
    home: '主页',
    info: '信息',
    link: '链接',
    lock: '锁定',
    map: '地图',
    menu: '菜单',
    pause: '暂停',
    phone: '电话',
    print: '打印',
    refresh: '刷新',
    restaurant: '餐厅',
    save: '保存',
    school: '学校',
    search: '搜索',
    settings: '设置',
    share: '分享',
    star: '星标',
    stop: '停止',
    today: '今天',
    upload: '上传',
    work: '工作',
    'sample-icon': '示例图标',
    'sample-pattern': '示例图案',
  };
  return map[nameWithoutSize] || nameWithoutSize;
};
