import { ReactNode, useState } from "react";
import Sidebar from "./Sidebar/Sidebar";
import NotificationsPanel from "./NotificationsPanel";
import SearchPanel from "./SearchPanel";
import styles from "./AppLayout.module.css";

export default function AppLayout({ children }: { children: ReactNode }) {
    const [notificationsOpen, setNotificationsOpen] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    return (
        <div className={styles.shell}>
            <Sidebar onToggleNotifications={() => { setSearchOpen(false); setNotificationsOpen((v) => !v) }} onToggleSearch={() => { setNotificationsOpen(false); setSearchOpen((v) => !v) }} notificationsOpen={notificationsOpen} searchOpen={searchOpen} />
            <main className={styles.main}>{children}</main>
            <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
            <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
        </div>
    );
}