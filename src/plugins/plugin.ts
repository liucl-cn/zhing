import {Context} from "@/context";
import {Plugin} from "@/plugin";
import {h, NSession} from '@'
import {exec} from "child_process";
import {promisify} from 'util'
import {Session, useContext, Zhin} from "@";

const promiseExec=promisify(exec)
const changeDependency=async (name?:string,unInstall?:boolean)=>{
    const cmd=`npm ${unInstall?'un':''}install ${name?? ''} --force`
    const {stderr}=await promiseExec(cmd,{cwd:process.cwd()})
    if(stderr){
        if(/npm ERR/i.test(stderr)){
            return [false,stderr]
        }
    }
    return [true,'']
}
const ctx = useContext()
function getPluginStatus(ctx: Context, session: Session, fullName: string) {
    if (session.bot.options.disable_plugins.includes(fullName)) return '(已停用)'
    const plugin = ctx.pluginList.find(p => p.options.fullName === fullName)
    if (!plugin) return ''
    const flag: `${keyof Zhin.Adapters}:${string | number}` = `${session.protocol}:${session.bot.self_id}`
    if (plugin.disableBots.includes(flag)) return '(已停用)'
}

const command = ctx.command('plugin [action:string] [name:string]')
    .desc('插件管理')
    .hidden()
    .action<NSession < keyof Zhin.Adapters>>(({session},action,name)=>{
        return session.execute(`plugin.${action} ${name}`)
    })
command.command('plugin.list','')
    .desc('插件列表')
    .option('-c [cloud:boolean] 云端插件')
    .action<NSession < keyof Zhin.Adapters>>(async ({session,options}) => {
        if(!options.cloud){
            const plugins=ctx.zhin.getInstalledModules('plugin')
            return plugins.map((o, idx) => {
                const installStatus = ctx.zhin.hasMounted(o.fullName) ? ' (已载入)' : ''
                let enableStatus = installStatus ? getPluginStatus(ctx, session, o.fullName) : ''
                return `${idx + 1}.${o.name}${installStatus}${enableStatus} ${o.type}`
            }).join('\n')
        }else{
            const packages = await ctx.zhin.getMarketPackages()
            return packages.map((o,idx)=>{
                const installStatus = ctx.zhin.hasMounted(o.name) ? ' (已载入)' : ''
                let enableStatus = installStatus ? getPluginStatus(ctx, session, o.name) : ''
                return `${idx + 1}.${o.name}@${o.version}${installStatus}${enableStatus} ${o.scope==='zhinjs'?'官方':'社区'}`
            }).join('\n')
        }
    })

command.command('plugin.install','<name:string>')
    .desc('安装插件')
    .option('-v [version:string] 指定版本，默认最新版')
    .action<NSession < keyof Zhin.Adapters>>(async ({session,options}, name) => {
        const packages = await ctx.zhin.getMarketPackages()
        const info=packages.find(p=>p.name===name)
        if (!info) return '该插件不存在'
        await session.reply('已开始安装...')
        try{
            const [success,err]=await changeDependency(`${name}@${options.version||info.version}`)
            return success?'安装成功':`安装失败:\n${err}`
        }catch (e){
            ctx.zhin.logger.warn(e.message)
            return `安装失败:\n${e.message}`
        }
    })
command.command('plugin.uninstall','<name:string>')
    .desc('卸载插件')
    .action<NSession < keyof Zhin.Adapters>>(async ({session}, name) => {
        const packages = ctx.zhin.getInstalledModules('plugin')
        const options=packages.find(p=>p.name===name)
        if (!options) return '没有安装该插件'
        if([Plugin.Source.built,Plugin.Source.local].includes(options.type)) return '只有模块化的插件才能卸载'
        await session.reply('已开始卸载...')
        try{
            const [success,err]=await changeDependency(`${options.fullName}`,true)
            return success?'卸载成功':`卸载失败:\n${err}`
        }catch (e){
            ctx.zhin.logger.error(e.message,e.stack)
            return `卸载失败:\n${e.message}`
        }
    })
command.command('plugin.mount','<name:string>')
    .desc('载入插件')
    .action<NSession < keyof Zhin.Adapters>>(async ({session}, name) => {
        const plugins=await ctx.zhin.getInstalledModules('plugin')
        const options = plugins.find(p => p.name === name)
        if (!options) return '没有安装该插件'
        try {
            ctx.zhin.plugin(name)
        } catch (e) {
            return '加载失败：' + e.message
        }
        return '载入成功'
    })
command.command('plugin.unmount','<name:string>')
    .desc('移除插件')
    .action(({session}, name) => {
        const plugin = ctx.zhin.pluginList.find(p => p.options.name === name)
        if (!plugin) return '没有载入该插件'
        try {
            plugin.unmount()
        } catch (e) {
            return '加载失败：' + e.message
        }
        return '移除成功'
    })
command.command('plugin.detail','<name:string>')
    .desc('查看指定插件详情')
    .action(async ({options}, name) => {
        const plugin = ctx.zhin.pluginList.find(p => p.options.fullName === name)
        if (!plugin) {
            const packages = await ctx.zhin.getMarketPackages()
            const info=packages.find(p=>p.name===name)
            if(info) return JSON.stringify(info,null,2)
            return '未找到插件：' + name
        }
        return JSON.stringify(plugin.info, null, 2)
            .replace(/"/g, '')
            .replace(/\\/g, '')
    })
command.command('plugin.on','<name:string>')
    .desc('启用插件')
    .action<NSession < keyof Zhin.Adapters>>(({options, session}, name) => {
        const plugin = ctx.zhin.pluginList.find(p => p.options.fullName === name)
        if (!plugin) return '未找到插件：' + name
        session.bot.enable(plugin)
        return `启用插件(${name})成功`
    })
command.command('plugin.off','<name:string>')
    .desc('停用插件')
    .action<NSession < keyof Zhin.Adapters>>(({options, session}, name) => {
        const plugin = ctx.zhin.pluginList.find(p => p.options.fullName === name)
        if (!plugin) return '未找到插件：' + name
        session.bot.disable(plugin)
        return `禁用插件(${name})成功`
    })
