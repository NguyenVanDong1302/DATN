import { ReactNode } from "react";
import Sidebar from "./Sidebar/Sidebar";
import styles from "./AppLayout.module.css";

export default function AppLayout({ children }: { children: ReactNode }) {
    return (
        <div className={styles.shell}>
            <Sidebar />
            <main className={styles.main}>{children}</main>
        </div>
    );
}