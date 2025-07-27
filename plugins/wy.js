"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const axios_1 = require("axios");
const CryptoJs = require("crypto-js");
const dayjs = require("dayjs");
const pageSize = 30;
// 音质参数
const qualityMap = {
    "low": "standard",
    "standard": "exhigh",
    "high": "lossless",
    "super": "hires",
    /*
        "standard": "128k标准音质",
        "higher": "192k高品音质",
        "exhigh": "320k极高音质",
        "lossless": "flac无损音质",
        "hires": "Hi-Res音质",
        "jyeffect": "高清环绕",
        "sky": "沉浸环绕", // SVIP
        "jymaster": "超清母带", // SVIP
    */
};



// 实现 eapi 请求
function MD5(data) {
    return CryptoJs.MD5(data)
        .toString(CryptoJs.enc.Hex);
}

function AES(data) {
    let key = CryptoJs.enc.Utf8.parse("e82ckenh8dichen8");
    let text = CryptoJs.enc.Utf8.parse(data);
    return CryptoJs.AES.encrypt(text, key, {
        mode: CryptoJs.mode.ECB,
        padding: CryptoJs.pad.Pkcs7
    }).ciphertext.toString(CryptoJs.enc.Hex);
}
async function EAPI(path, json = {}) {

    let params = [path, JSON.stringify(json)];
    params.push(MD5(
        "nobody" +
        params.join("use") +
        "md5forencrypt"
    ));
    params = AES(params.join("-36cd479b6b5-"));

    let { // 获取用户数据
        music_u
    } = env && env.getUserVariables();
    let music_a = (music_u || "").match(/MUSIC_[UA]=([^;]+)/i)
    music_u = "os=pc; " + (music_a ? "appver=9.0.25; MUSIC_U=" + music_a[1] : "");

    return (await (0, axios_1.default)({
        url: path.replace("/", "https://interface.music.163.com/e"),
        method: "POST",
        data: "params=" + params.toUpperCase(),
        headers: {
            cookie: music_u
        },
    })).data;
}



// 格式化歌曲信息
function formatMusicItem(_) {
    _ = _.baseInfo || _.song || _;
    let name = _.name || _.songname;
    let singer = _.ar && _.ar.map(_ => _.name).join('&') || "";
    let albumName = _.al && _.al.name;
    let albumId = (_.al && _.al.id) || "";
    let picUrl = (_.al && _.al.picUrl) || "";
    let qualities = {};
    for (let k of ['l', 'h', 'sq', 'hr']) {
        if (_[k] || (k == 'l' && _[k = 'm'])) {
            let t = {
                'm': "low",
                'l': "low", //192k
                'h': "standard",
                'sq': "high",
                'hr': "super"
            }[k];
            qualities[t] = {};
            qualities[t].size = _[k].size;
            // qualities[t].url = "";
        }
    }
    let content = ((_.fee == 0 || _.fee == 8) && (_.privilege ? (_.privilege.st > -1) : 1)) ? 0 : 1;
    return {
        /* 歌曲在平台的唯一编号 */
        id: _.id,
        /* 隶属插件 */
        // platform: "网易云",
        /* 作者 */
        artist: singer,
        /* 标题 */
        title: name,
        /* 别名 */
        // alias: "",
        /* 时长(s) */
        duration: _.dt,
        /* 专辑名 */
        album: albumName,
        /* 专辑封面图 */
        artwork: picUrl,
        /* 音质信息 */
        qualities,
        /* 其他信息 */
        albumId,
        content,

        /* 默认音源 */
        // url: `http://music.163.com/song/media/outer/url?id=${songId}.mp3`
        /* 音源 */
        // source?: Partial<Record<IQualityKey, IMediaSource>>

        rawLrc: _.lyrics,
    }
}
// 获取歌曲详情
async function getMusicInfo(musicItem) {
    let _ = await EAPI("/api/v3/song/detail", {
        c: `[{"id":"${musicItem.id}"}]`
    });
    let a = _.songs[0] || _.privileges[0];
    a.privilege = _.privileges[0];
    return formatMusicItem(a);
}



// 格式化专辑信息
function formatAlbumItem(_) {
    return {
        /* 专辑id */
        id: _.id,
        /* 专辑名称 */
        title: _.name,
        /* 作者名称 */
        artist: _.artist.name,
        /* 封面图 */
        artwork: _.picUrl,
        /* 专辑描述 */
        description: _.description,
        /* 专辑发布时间 */
        date: dayjs.unix(_.publishTime / 1000).format("YYYY-MM-DD"),
        /* 专辑内有多少作品 */
        worksNum: _.artist.musicSize,
        /* 其他参数 */
        content: 4
    };
}
// 获取专辑详情
async function getAlbumInfo(albumItem) {
    let res = await EAPI("/api/v1/album/" + albumItem.id, {});
    return {
        isEnd: true,
        albumItem: formatAlbumItem(res.album),
        musicList: (res.songs || []).map(formatMusicItem),
    };
}



// 格式化作者信息
function formatArtistItem(_) {
    return {
        /* 隶属插件 */
        // platform: "网易云",
        /* 作者id */
        id: _.id,
        /* 作者名称 */
        name: _.name,
        /* 头像 */
        avatar: _.img1v1Url,
        /* 简介 */
        description: _.briefDesc || _.description,
        /* 作品总数 */
        worksNum: _.musicSize || _.albumSize,
        /* 粉丝数 */
        // fans: 0,
        /* 其他参数 */
        content: 5
    };
}
// 获取歌手详情
async function getArtistWorks(artistItem, page, type) {
    let T = {
        "music": {
            "path1": "/api/v1/artist/",
            "path2": "hotSongs",
            "mapJs": formatMusicItem
        },
        "album": {
            "path1": "/api/artist/albums/",
            "path2": "hotAlbums",
            "mapJs": formatAlbumItem
        },
    }[type];
    let res = await EAPI(T.path1 + artistItem.id, {});
    return {
        isEnd: true,
        artistItem: formatArtistItem(res.artist),
        data: res[T.path2].map(T.mapJs),
    };
}



// 格式化歌单信息
function formatSheetItem(_) {
    _ = _.baseInfo || _;
    return {
        /* 歌单id */
        id: _.id || _.resourceId,
        /* 标题 */
        title: _.name || _.title,
        /* 作者 */
        artist: (_.creator && _.creator.nickname),
        /* 封面图 */
        // coverImg: "",
        artwork: _.coverImgUrl || _.picUrl || _.coverImg,
        /* 描述 */
        description: _.description,
        /* 作品总数 */
        worksNum: _.trackCount,
        /* 其他参数 */
        playCount: _.playCount,
        date: _.updateTime,
        createUserId: _.userId,
        createTime: _.createTime,
        content: 2
    };
}
// 获取歌单详情
async function getMusicSheetInfo(sheet, page = 1) {
    let _ = (await EAPI("/api/v6/playlist/detail", {
        n: 99999,
        id: sheet.id
    })).playlist;
    let list = _.tracks || [];
    return {
        isEnd: 99999 >= _.trackCount,
        sheetItem: formatSheetItem(_),
        musicList: list.map(formatMusicItem)
    };
}



// 获取排行榜分类
async function getTopLists() {
    let group1 = [];
    let group2 = await EAPI("/api/toplist/detail/v2", {});
    group2.data.map(_ => {
        if (_.list && _.list.length) {
            let group3 = [];
            _.list.map(_ => {
                if (_.id != 0) {
                    group3.push({
                        title: _.name,
                        coverImg: _.coverUrl,
                        content: 3,
                        id: _.id,
                        description: _.updateFrequency
                    });
                }
            });
            group1.push({
                title: _.name,
                data: group3
            });
        }
    });
    return group1;
}
// 获取榜单详情，网易云可以跳转到歌单详情函数
async function getTopListDetail(topListItem) {
    let res = await getMusicSheetInfo(topListItem);
    res.topListItem = res.sheetItem;
    res.topListItem.content = 3;
    return res;
}



// 获取歌单分类
async function getRecommendSheetTags() {
    let group1 = [{
            title: "推荐",
            id: "_SPECIAL_CLOUD_VILLAGE_PLAYLIST"
        },
        {
            title: "官方",
            id: "官方"
        },
        {
            title: "雷达",
            id: "_RADAR"
        },
        {
            title: "原创",
            id: "_SPECIAL_ORIGIN_SONG_LOCATION"
        },
        {
            title: "心情",
            id: "_FEELING_PLAYLIST_LOCATION"
        },
        {
            title: "场景",
            id: "_SCENE_PLAYLIST_LOCATION"
        },
        {
            title: "专属",
            id: "_COMBINATION"
        },
        {
            title: "全部",
            id: "全部歌单"
        },
        {
            title: "新热",
            id: "_NEW_SONG_AND_ALBUM"
        },
        {
            title: "影视",
            id: "_FIRM_PLAYLIST"
        },
        {
            title: "奖项",
            id: "_AWARDS_PLAYLIST"
        },
    ];
    let group2 = ["语种", "风格", "场景", "情感", "主题"]
        .map(name => {
            return ({
                title: name,
                data: []
            });
        });
    let group3 = await EAPI("/api/playlist/catalogue/v1", {});
    group3.sub.map(_ => {
        group2[_.category].data.push({
            title: _.name,
            id: _.name
        });
    });
    return {
        pinned: group1,
        data: group2,
    };
}
// 通过分类获取歌单列表
async function getRecommendSheetsByTag(tag, page) {
    let _, t1 = tag === null || tag === void 0 || (tag && tag.id);
    if (t1 === "" || t1 === true) { // 默认
        _ = await EAPI("/api/personalized/playlist", {
            limit: 30
        }, {
            Cookie: ""
        });
    } else if (/^_[A-Z]+/.test(t1)) { // 推荐
        _ = (await EAPI("/api/link/page/rcmd/resource/show", {
            "pageCode": "HOME_RECOMMEND_PAGE",
            "isFirstScreen": "false",
            "cursor": "6",
            "refresh": "true",
            "blockCodeOrderList": `["PAGE_RECOMMEND${t1}"]`
        })).data.blocks[0].dslData;
        _ = (_.home_page_common_playlist_module_d1r94fwj80 || _.home_page_scene_playlist_module_w5rp24j0x2 || _.home_page_scene_playlist_module_rsoa9pd6fn || _).blockResource;
    } else {
        _ = await EAPI("/api/playlist/list", {
            cat: t1 || "全部",
            order: "hot",
            limit: pageSize,
            offset: (page - 1) * pageSize,
            total: true,
            csrf_token: "",
        });
    }
    let list = _.result || _.playlists || _.resources || [];
    let total1 = page * pageSize;
    let total2 = _.total || (total1 - pageSize + list.length);
    return {
        isEnd: (_.more !== true) || (total2 <= total1),
        data: list.map(formatSheetItem)
    };
}



// 匹配歌单链接，跳转到歌单详情函数
// 需要返回列表，获取musicList
async function importMusicSheet(urlLike) {
    let id = (urlLike.match(/^(\d+)$/) || [])[1];
    if (!id && !urlLike.match(/music\.163\.com/i)) {
        return false;
    }
    if (!id) {
        id = (urlLike.match(/playlist(\/|.*?[\?\&]id=)(\d+)/i) || [])[2];
    }
    if (!id) {
        return false;
    }
    return (await getMusicSheetInfo({
        id
    })).musicList;
}



// 匹配单曲链接，跳转到单曲详情函数
async function importMusicItem(urlLike) {
    let id = (urlLike.match(/^(\d+)$/) || [])[1];
    if (!id && !urlLike.match(/music\.163\.com/i)) {
        return false;
    }
    if (!id) {
        id = (urlLike.match(/song(.*?[\?\&]id=|\/)(\d+)/i) || [])[2];
    }
    if (!id) {
        return false;
    }
    return await getMusicInfo({
        id
    });
}



// 获取在线歌词
async function getLyric(musicItem) {
    try {
        const response = await axios_1.get("https://music.163.com/api/song/lyric", {
            params: {
                id: musicItem.id,
                lv: -1,
                tv: -1
            },
            headers: {
                os: "pc"
            }
        });

        return {
            rawLrc: response.data.lrc?.lyric || '',
            translation: response.data.tlyric?.lyric || ''
        };
    } catch (error) {
        console.error("获取歌词时出错:", error.message);
        return {
            rawLrc: '',
            translation: ''
        };
    }
}



// 获取播放链接
async function getMediaSource(musicItem, quality) {
    if (!musicItem.qualities[quality]) {
        return false
    }
    let _ = (await EAPI("/api/song/enhance/player/url/v1", {
        ids: `["${musicItem.id}"]`,
        encodeType: "flac",
        immerseType: "c51",
        trialMode: "23", // 试听
        level: qualityMap[quality]
    })).data;
    if (_ && _[0] && _[0].url) {
        return {
            url: String(_[0].url).split("?")[0],
            size: _[0].size,
            quality,
            // userAgent: "",
            // headers: {},
        };
    }
    if (_ && _[0] && (_[0].code == 404 || _[0].fee == 1)) {
        return await KUWO(musicItem, quality);
    }
    return false;
}



// 获取灰色歌曲
async function KUWO(musicItem, quality) {
    let {
        source
    } = env && env.getUserVariables();
    let params = {
        // 必要参数
        rformat: "json", // 返回格式
        encoding: "utf8", // 编码方式
        ft: "music", // 搜索类型
        rn: 30, // 获取30个
        pn: 0, // 当前页数
        all: musicItem.title, // 搜索的关键词

        itemset: "web_2013",
        client: "kt",
        pcjson: 1
    };
    // 此参数存在时会返回vip歌曲
    if (source) params.vipver = "MUSIC_8.0.3.0_BCS75"

    // 搜索
    var songId;
    let sou = (await (0, axios_1.default)({
        method: "get",
        url: "http://search.kuwo.cn/r.s",
        params
    })).data.abslist;
    for (let _ of sou) {
        if (!_.SONGNAME.match('片段')) {
            songId = _.MUSICRID.split('_')[1].split('&')[0];
            break;
        };
    }
    // console.log(songId);

    // 获取
    let res = (await axios_1.default.get("http://nmobi.kuwo.cn/mobi.s", {
        params: {
            f: "web",
            source: source,
            type: "convert_url_with_sign",
            rid: songId,
            br: {
                "low": "128kmp3",
                "standard": "320kmp3",
                "high": "2000kflac",
                "super": "20000kflac",
            }[quality],
        },
        headers: {
            "User-Agent": "okhttp/4.10.0"
        }
    })).data;
    // console.log(res);
    return {
        url: res.data.url.split("?")[0],
        quality
    }
}





// 格式化歌曲评论
function formatComment(_) {
    return {
        id: _.commentId,
        // 用户名
        nickName: _.user && _.user.nickname,
        // 头像
        avatar: _.user && _.user.avatarUrl,
        // 评论内容
        comment: _.content,
        // 点赞数
        like: _.likedCount,
        // 评论时间
        createAt: _.time,
        // 地址
        location: _.ipLocation && _.ipLocation.location,
        // 回复
        replies: (_.beReplied || []).map(formatComment),
        /* 其他参数 */
        content: 6
    };
}
// 获取歌曲评论
async function getMusicComments(musicItem, limit = 20) {
    const url = "https://zm.armoe.cn/comment/music";
    let allComments = [];
    let offset = 0;
    let before = null;
    let isEnd = false;

    while (!isEnd) {
        const params = {
            id: musicItem.id,
            limit: limit,
            offset: offset,
            before: before
        };

        try {
            const response = await axios_1.get(url, { params });
            const result = response.data;

            if (!result || !result.comments) {
                throw new Error("评论数据为空或获取失败");
            }

            const comments = result.comments.map(formatComment);
            allComments = [...allComments, ...comments];
            isEnd = result.more === false;

            if (!isEnd) {
                before = comments[comments.length - 1]?.createAt;
                offset += limit;
            }
        } catch (error) {
            console.error("获取评论时出错:", error.message);
            break;
        }
    }

    return {
        isEnd,
        total: allComments.length,
        data: allComments
    };
}



// 搜索函数
async function searchBase(query, page, type, v1 = "") {
    let path = "/api" + v1 + "/search/" + (/\//.test(type) ? type : (type + "/get"));
    let data = {
        "filterCode": "-1",
        "offset": ((page - 1) * pageSize) + "",
        "limit": pageSize + "",
        "channel": "typing",
        "keyword": query,
        "scene": "normal",
        "s": query,
    };
    let res = await EAPI(path, data);
    return res.data || res.result;
}
module.exports = {
    platform: "网易云",
    author: '反馈Q群@365976134',
    version: "2025.01.22",
    appVersion: ">0.2.0-alpha",
    srcUrl: "https://testingcf.jsdelivr.net/gh/Lmlanmei64/MusicFreePlugins@master/plugins/wy.js",
    cacheControl: "no-store",
    hints: {
        importMusicSheet: [
            "网易云：APP点击分享，然后复制链接",
            "默认歌单无法导入，先新建一个空白歌单复制过去再导入新歌单即可"
        ],
        importMusicItem: [
            "网易云：APP点击分享，然后复制链接"
        ]
    },
    userVariables: [{
        key: "music_u",
        name: "用户数据(cookie)",
        hint: "MUSIC_U 或 MUSIC_A"
    }, {
        key: "source",
        name: "酷我白名单渠道",
        hint: "source"
    }],
    supportedSearchType: ["music", "album", "sheet", "artist", "lyric"],
    async search(query, page, type) {
        let stype = {
            music: {
                t: "song",
                m: formatMusicItem,
            },
            album: {
                t: type,
                c: "4",
                v: "/v1",
                m: formatAlbumItem,
            },
            artist: {
                t: type,
                c: "5",
                v: "/v1",
                m: formatArtistItem,
            },
            sheet: {
                t: "playlist",
                c: "2",
                m: formatSheetItem,
            },
            lyric: {
                t: "resource/lyric",
                m: formatMusicItem
            }
        }[type];
        let _ = await searchBase(query, page, stype.t, stype.v);
        let list = _.resources || _.albums || _.artists || [];
        let total1 = page * pageSize
        let total2 = _.songCount || _.playlistCount || _.albumCount || _.totalCount || (total1 - pageSize + list.length);
        return {
            isEnd: total2 <= total1,
            data: list.map(stype.m)
        }
    },
    importMusicSheet,
    importMusicItem,
    getMusicInfo,
    getAlbumInfo,
    getArtistWorks,
    getMusicSheetInfo,
    getTopLists,
    getTopListDetail,
    getRecommendSheetTags,
    getRecommendSheetsByTag,
    getMediaSource,
    getLyric,
    getMusicComments,,
  description: '本插件修改于[ThomasBy2025/musicfree](https://github.com/ThomasBy2025/musicfree)\n配合[xujin621/Photo](https://gitee.com/xujin621/Photo)中的“元力WY”插件可播放会员歌曲的同时实现所有功能（需要在musicfree将该插件“音源重定向”为“元力WY”）'
};
