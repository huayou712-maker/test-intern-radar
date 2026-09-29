import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'测试开发实习岗位雷达',description:'追踪公开招聘来源里的测试开发、软件测试、SDET 与 QA 实习岗位。查看真实要求、岗位变化和截止日期。'};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
