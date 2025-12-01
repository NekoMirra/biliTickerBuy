<div align="center">
  <a href="https://github.com/NekoMirra/biliTickerBuy" target="_blank">
    <img width="160" src="bili-ticker-buy-rust\bili-ticker-buy-rust\src\assets\icon.ico" alt="logo">
  </a>
  <h2 id="koishi">biliTickerBuy (Rust 重构版)</h1>

<p>
  <!-- GitHub Downloads -->
  <a href="https://github.com/NekoMirra/biliTickerBuy/releases">
    <img src="https://img.shields.io/github/downloads/NekoMirra/biliTickerBuy/total" alt="GitHub all releases">
  </a>
  <!-- GitHub Release Version -->
  <a href="https://github.com/NekoMirra/biliTickerBuy/releases">
    <img src="https://img.shields.io/github/v/release/NekoMirra/biliTickerBuy" alt="GitHub release (with filter)">
  </a>
  <!-- GitHub Issues -->
  <a href="https://github.com/NekoMirra/biliTickerBuy/issues">
    <img src="https://img.shields.io/github/issues/NekoMirra/biliTickerBuy" alt="GitHub issues">
  </a>
  <!-- GitHub Stars -->
  <a href="https://github.com/NekoMirra/biliTickerBuy/stargazers">
    <img src="https://img.shields.io/github/stars/NekoMirra/biliTickerBuy" alt="GitHub Repo stars">
  </a>
</p>

这是一个开源免费，简单易用的B站会员购辅助工具。
<br/>
**本项目是基于 [mikumifa/biliTickerBuy](https://github.com/mikumifa/biliTickerBuy) 的 Rust 重构版本，提供了美观的前端UI，理论具有极高性能，并实现了账号管理、精确校时、历史记录、任务管理等功能。**
</div>

## 🎇 程序预览
<img width="1204" height="947" alt="image" src="https://github.com/user-attachments/assets/d960c243-9bf7-4d2b-9c70-33f9c1fdbfc6" />

## 💻 快速安装

从github仓库获取[下载](https://github.com/NekoMirra/biliTickerBuy/releases)或自行克隆到本地进行构建

## 📩 免责声明

本项目遵循 MIT License 许可协议，仅供个人学习与研究使用。请勿将本项目用于任何商业牟利行为，亦严禁用于任何形式的代抢、违法行为或违反相关平台规则的用途。由此产生的一切后果均由使用者自行承担，与本人无关。

若您 fork 或使用本项目，请务必遵守相关法律法规与目标平台规则。

## 💡 关于访问频率与并发控制

本项目在设计时严格遵循「非侵入式」原则，避免对目标服务器（如 Bilibili）造成任何干扰。

所有网络请求的时间间隔均由用户自行配置，默认值模拟正常用户的手动操作速度。程序默认单线程运行，遇到请求失败时，程序会进行有限次数的重试，并在重试之间加入适当的延时，避免形成高频打点。项目完全依赖平台公开接口及网页结构，不含风控规避、API劫持等破坏性手段。

## 🛡️ 平台尊重声明

本程序设计时已尽可能控制请求频率，避免对 Bilibili 服务器造成任何明显负载或影响。项目仅作为学习用途，无任何恶意行为或干扰服务的企图。

如本项目中存在侵犯 Bilibili 公司合法权益的内容，请通过邮箱 [NekoMirra@outlook.com](NekoMirra@outlook.com]) 与我联系或与原项目作者联系，将第一时间下架相关内容并删除本仓库。对此造成的不便，我深表歉意，感谢您的理解与包容。

## 🤩 原项目贡献者

<a href="https://github.com/mikumifa/biliTickerBuy/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=mikumifa/biliTickerBuy&preview=true&max=&columns=" />
</a>
<br /><br />
